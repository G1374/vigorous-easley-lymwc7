import "./styles.css";

const USERS_KEY = "cloudbox.media.vault.users.v2";
const SESSION_KEY = "cloudbox.media.vault.session.v2";
const DB_NAME = "cloudbox-media-vault";
const DB_VERSION = 2;
const FILE_STORE = "files";
const VIDEO_TYPES = ["mp4", "webm", "ogg", "mov", "m4v", "mkv", "avi"];
const AUDIO_TYPES = ["mp3", "wav", "ogg", "m4a", "flac", "aac"];
const GOOGLE_CLIENT_ID = typeof process !== "undefined" ? process.env.GOOGLE_CLIENT_ID || "" : "";
const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";

const state = {
  user: null,
  items: [],
  currentFolderId: "root",
  selectedItemId: null,
  authMode: "login",
  authError: "",
  googleAuthStatus: "",
  previewMode: false,
  aiPrompt: "",
  aiResponse: "Ask the Vault AI to summarize files, search your library, build cleanup plans, create media queues, find duplicates, suggest folders, or organize media automatically.",
  installPrompt: null,
  installStatus: "Install on Android or PC from this button when your browser supports it.",
};

const app = document.getElementById("app");

function googleClientId() {
  return (
    GOOGLE_CLIENT_ID ||
    window.CLOUDBOX_GOOGLE_CLIENT_ID ||
    document.querySelector('meta[name="google-client-id"]')?.content ||
    ""
  ).trim();
}

function decodeJwtPayload(token) {
  const payload = token.split(".")[1];
  if (!payload) return null;

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function metadataKey(userId = state.user?.id) {
  return `cloudbox.media.vault.items.v2.${userId}`;
}

function fileKey(itemId, userId = state.user?.id) {
  return `${userId}:${itemId}`;
}

function loadJson(key, fallback) {
  const stored = localStorage.getItem(key);
  if (!stored) return fallback;
  return JSON.parse(stored);
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadUsers() {
  return loadJson(USERS_KEY, []);
}

function saveUsers(users) {
  saveJson(USERS_KEY, users);
}

function loadItems() {
  if (!state.user) return [];
  return loadJson(metadataKey(), []);
}

function saveItems() {
  if (!state.user || state.previewMode) return;
  const serializable = state.items.map(({ file, objectUrl, ...item }) => item);
  saveJson(metadataKey(), serializable);
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const encodedPassword = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey("raw", encodedPassword, "PBKDF2", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    keyMaterial,
    256,
  );

  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(new Uint8Array(derivedBits)),
  };
}

async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, base64ToBytes(user.salt));
  return hash === user.passwordHash;
}

function openVaultDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(FILE_STORE)) {
        db.deleteObjectStore(FILE_STORE);
      }
      db.createObjectStore(FILE_STORE, { keyPath: "key" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withFileStore(mode, operation) {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE, mode);
    const store = transaction.objectStore(FILE_STORE);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

function putStoredFile(itemId, file) {
  return withFileStore("readwrite", (store) => store.put({ key: fileKey(itemId), userId: state.user.id, itemId, file }));
}

function getStoredFile(itemId) {
  return withFileStore("readonly", (store) => store.get(fileKey(itemId)));
}

function deleteStoredFile(itemId) {
  return withFileStore("readwrite", (store) => store.delete(fileKey(itemId)));
}

async function hydrateStoredFiles() {
  const files = state.items.filter((item) => item.type !== "folder");

  await Promise.all(
    files.map(async (item) => {
      const record = await getStoredFile(item.id);
      if (record?.userId === state.user.id && record?.file) {
        item.file = record.file;
        item.objectUrl = URL.createObjectURL(record.file);
      }
    }),
  );
}

function revokeObjectUrls() {
  state.items.filter((item) => item.objectUrl).forEach((item) => URL.revokeObjectURL(item.objectUrl));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function extensionFor(name = "") {
  return name.split(".").pop()?.toLowerCase() || "";
}

function mediaKind(file) {
  const ext = extensionFor(file.name);
  if (file.type.startsWith("video/") || VIDEO_TYPES.includes(ext)) return "video";
  if (file.type.startsWith("audio/") || AUDIO_TYPES.includes(ext)) return "audio";
  return "file";
}

function currentFolder() {
  if (state.currentFolderId === "root") {
    return { id: "root", name: "My Vault", parentId: null, type: "folder" };
  }

  const folder = state.items.find((item) => item.id === state.currentFolderId && item.type === "folder");
  if (folder) return folder;

  state.currentFolderId = "root";
  return { id: "root", name: "My Vault", parentId: null, type: "folder" };
}

function childrenOf(folderId) {
  return state.items
    .filter((item) => item.parentId === folderId)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function folderPath() {
  const path = [];
  let cursor = currentFolder();

  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parentId ? state.items.find((item) => item.id === cursor.parentId) : null;
  }

  return path;
}

function totalStoredBytes() {
  return state.items.reduce((sum, item) => sum + (item.size || 0), 0);
}

function filesOnly() {
  return state.items.filter((item) => item.type !== "folder");
}

function foldersOnly() {
  return state.items.filter((item) => item.type === "folder");
}

function folderName(folderId) {
  if (folderId === "root") return "My Vault";
  return state.items.find((item) => item.id === folderId)?.name || "Unknown folder";
}

function suggestedFolderName(item) {
  if (item.type === "video") return "Movies";
  if (item.type === "audio") return "Music";
  if (["pdf", "doc", "docx", "txt", "md", "rtf"].includes(item.extension)) return "Documents";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(item.extension)) return "Pictures";
  if (["zip", "rar", "7z", "tar", "gz"].includes(item.extension)) return "Archives";
  return "Files";
}

function duplicateGroups() {
  const groups = new Map();
  filesOnly().forEach((item) => {
    const key = `${item.name.toLowerCase()}-${item.size}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

function buildAiInsights() {
  const files = filesOnly();
  const videos = files.filter((item) => item.type === "video");
  const songs = files.filter((item) => item.type === "audio");
  const docs = files.filter((item) => item.type === "file");
  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 3);
  const duplicates = duplicateGroups();
  const uncategorized = files.filter((item) => item.parentId === "root");
  const folderSuggestions = [...new Set(uncategorized.map(suggestedFolderName))];

  return { files, videos, songs, docs, largest, duplicates, uncategorized, folderSuggestions };
}

function percentage(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function sortedByUpdated(items = state.items) {
  return [...items].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

function extensionGroups() {
  const groups = new Map();
  filesOnly().forEach((item) => {
    const label = (item.extension || "unknown").toUpperCase();
    const current = groups.get(label) || { label, count: 0, size: 0 };
    current.count += 1;
    current.size += item.size || 0;
    groups.set(label, current);
  });

  return [...groups.values()].sort((a, b) => b.size - a.size);
}

function filesMissingBlobs() {
  if (state.previewMode) return [];
  return filesOnly().filter((item) => !item.objectUrl);
}

function oldLargeFiles() {
  const thirtyDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 30;
  return filesOnly()
    .filter((item) => (item.size || 0) > 50 * 1024 * 1024 && new Date(item.updatedAt || item.createdAt || 0).getTime() < thirtyDaysAgo)
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);
}

function buildDashboardStats() {
  const insights = buildAiInsights();
  const files = insights.files.length;
  const storage = totalStoredBytes();
  const largestType = extensionGroups()[0];
  const recent = sortedByUpdated(state.items).slice(0, 5);
  const healthIssues = [
    insights.duplicates.length ? `${insights.duplicates.length} duplicate group(s)` : "No duplicate groups",
    filesMissingBlobs().length ? `${filesMissingBlobs().length} file(s) need re-upload` : "All loaded files are playable/downloadable",
    insights.uncategorized.length ? `${insights.uncategorized.length} root file(s) can be organized` : "Root folder is organized",
  ];

  return {
    ...insights,
    files,
    storage,
    folders: foldersOnly().length,
    videoPercent: percentage(insights.videos.length, files),
    audioPercent: percentage(insights.songs.length, files),
    documentPercent: percentage(insights.docs.length, files),
    largestType,
    recent,
    healthIssues,
  };
}

function renderTypeBar(label, value, emoji) {
  return `
    <div class="type-bar">
      <span>${emoji} ${escapeHtml(label)}</span>
      <strong>${value}%</strong>
      <i style="--value: ${value}%"></i>
    </div>
  `;
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function demoItem(overrides) {
  return {
    id: crypto.randomUUID(),
    ownerId: "preview-user",
    createdAt: daysAgo(8),
    updatedAt: daysAgo(2),
    size: 0,
    mime: "application/octet-stream",
    extension: "",
    parentId: "root",
    ...overrides,
  };
}

function createDashboardPreviewItems() {
  const movies = demoItem({ id: "preview-movies", type: "folder", name: "Movies", parentId: "root", mime: "", updatedAt: daysAgo(1) });
  const music = demoItem({ id: "preview-music", type: "folder", name: "Music", parentId: "root", mime: "", updatedAt: daysAgo(2) });
  const docs = demoItem({ id: "preview-docs", type: "folder", name: "Documents", parentId: "root", mime: "", updatedAt: daysAgo(3) });

  return [
    movies,
    music,
    docs,
    demoItem({ type: "video", name: "Family Movie Night.mp4", parentId: movies.id, size: 1_950_000_000, mime: "video/mp4", extension: "mp4", updatedAt: daysAgo(1) }),
    demoItem({ type: "video", name: "Travel Highlights.mkv", parentId: movies.id, size: 2_840_000_000, mime: "video/x-matroska", extension: "mkv", updatedAt: daysAgo(5) }),
    demoItem({ type: "audio", name: "Morning Playlist.mp3", parentId: music.id, size: 8_400_000, mime: "audio/mpeg", extension: "mp3", updatedAt: daysAgo(2) }),
    demoItem({ type: "audio", name: "Focus Beats.flac", parentId: music.id, size: 46_000_000, mime: "audio/flac", extension: "flac", updatedAt: daysAgo(4) }),
    demoItem({ type: "file", name: "Cloud Storage Plan.pdf", parentId: docs.id, size: 4_200_000, mime: "application/pdf", extension: "pdf", updatedAt: daysAgo(6) }),
    demoItem({ type: "file", name: "Tax Backup.zip", parentId: "root", size: 720_000_000, mime: "application/zip", extension: "zip", updatedAt: daysAgo(40) }),
    demoItem({ type: "video", name: "Family Movie Night.mp4", parentId: "root", size: 1_950_000_000, mime: "video/mp4", extension: "mp4", updatedAt: daysAgo(9) }),
  ];
}

function openDashboardPreview() {
  revokeObjectUrls();
  state.previewMode = true;
  state.user = {
    id: "preview-user",
    email: "preview@cloudbox.local",
    displayName: "Dashboard Preview",
  };
  state.items = createDashboardPreviewItems();
  state.currentFolderId = "root";
  state.selectedItemId = null;
  state.aiPrompt = "";
  state.aiResponse = "Preview mode is using sample movies, songs, files, duplicates, and cleanup suggestions so you can see the dashboard before uploading anything.";
  renderApp();
}

function renderDashboard() {
  const stats = buildDashboardStats();
  const recentItems = stats.recent.length
    ? stats.recent.map((item) => `<li><span>${iconFor(item)}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(folderName(item.parentId))}</small></li>`).join("")
    : `<li><span>✨</span><strong>No uploads yet</strong><small>Upload files to fill the dashboard.</small></li>`;
  const largestType = stats.largestType ? `${stats.largestType.label} · ${formatBytes(stats.largestType.size)}` : "No file types yet";

  return `
    <section class="dashboard-panel" aria-label="AI dashboard overview">
      <div class="dashboard-header">
        <div>
          <p class="eyebrow">Command dashboard</p>
          <h2>Your vault cockpit</h2>
          <p>Live overview of storage, media mix, recent activity, and AI health checks for this signed-in account.</p>
        </div>
        <div class="dashboard-score">
          <span>AI health</span>
          <strong>${Math.max(0, 100 - stats.duplicates.length * 10 - filesMissingBlobs().length * 20 - stats.uncategorized.length * 2)}%</strong>
        </div>
      </div>

      <div class="dashboard-grid">
        <article class="dashboard-card storage-card">
          <span>Storage used</span>
          <strong>${formatBytes(stats.storage)}</strong>
          <small>Largest type: ${escapeHtml(largestType)}</small>
        </article>
        <article class="dashboard-card">
          <span>Library</span>
          <strong>${stats.files}</strong>
          <small>${stats.folders} folders · ${stats.videos.length} movies · ${stats.songs.length} songs</small>
        </article>
        <article class="dashboard-card">
          <span>AI cleanup</span>
          <strong>${stats.duplicates.length + filesMissingBlobs().length + stats.uncategorized.length}</strong>
          <small>Actionable suggestions ready</small>
        </article>
      </div>

      <div class="dashboard-lower">
        <div class="media-mix">
          <h3>Media mix</h3>
          ${renderTypeBar("Movies", stats.videoPercent, "🎬")}
          ${renderTypeBar("Music", stats.audioPercent, "🎵")}
          ${renderTypeBar("Files", stats.documentPercent, "📄")}
        </div>
        <div class="activity-feed">
          <h3>Recent activity</h3>
          <ul>${recentItems}</ul>
        </div>
        <div class="ai-health">
          <h3>AI health scan</h3>
          <ul>${stats.healthIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>
        </div>
      </div>
    </section>
  `;
}

function renderAiInsights() {
  const insights = buildAiInsights();
  const largest = insights.largest.length
    ? insights.largest.map((item) => `${item.name} (${formatBytes(item.size)})`).join(", ")
    : "No uploaded files yet";
  const duplicateText = insights.duplicates.length
    ? `${insights.duplicates.length} possible duplicate group(s) found`
    : "No obvious duplicate files";
  const suggestionText = insights.folderSuggestions.length
    ? insights.folderSuggestions.join(", ")
    : "Upload files to get folder ideas";

  return `
    <section class="ai-panel" aria-label="Vault AI assistant">
      <div>
        <p class="eyebrow">Local AI tools</p>
        <h2>Vault AI Assistant</h2>
        <p>This on-device assistant reads your file names, types, sizes, and folders to generate private organization tips without sending data to a server.</p>
      </div>
      <div class="ai-metrics">
        <span>🎬 ${insights.videos.length} movies</span>
        <span>🎵 ${insights.songs.length} songs</span>
        <span>📄 ${insights.docs.length} files</span>
      </div>
      <form id="aiForm" class="ai-form">
        <input id="aiPrompt" type="text" value="${escapeHtml(state.aiPrompt)}" placeholder="Ask: find duplicates, summarize, suggest folders..." />
        <button type="submit">Ask AI</button>
      </form>
      <div class="ai-actions">
        <button id="organizeButton" type="button">AI organize files</button>
        <button id="suggestFoldersButton" type="button">Create suggested folders</button>
        <button id="exportVaultButton" type="button">Download vault index</button>
        <button id="smartSummaryButton" type="button">AI smart summary</button>
        <button id="cleanupPlanButton" type="button">AI cleanup plan</button>
        <button id="mediaQueueButton" type="button">AI media queue</button>
        <button id="securityScanButton" type="button">AI security scan</button>
      </div>
      <div class="ai-answer">
        <strong>${escapeHtml(state.aiResponse)}</strong>
        <small>Largest: ${escapeHtml(largest)} · ${escapeHtml(duplicateText)} · Suggested folders: ${escapeHtml(suggestionText)}</small>
      </div>
    </section>
  `;
}

function answerVaultQuestion(prompt) {
  const query = prompt.toLowerCase();
  const insights = buildAiInsights();

  if (!prompt.trim()) return "Try asking about duplicates, movies, songs, large files, folders, storage, search terms, security, cleanup, or playlists.";
  if (query.includes("duplicate")) {
    if (!insights.duplicates.length) return "I found no obvious duplicates by matching file name and size.";
    return `Possible duplicates: ${insights.duplicates.map((group) => group.map((item) => item.name).join(" / ")).join("; ")}.`;
  }
  if (query.includes("movie") || query.includes("video")) {
    return insights.videos.length ? `Movies: ${insights.videos.map((item) => `${item.name} in ${folderName(item.parentId)}`).join(", ")}.` : "No uploaded movies yet.";
  }
  if (query.includes("song") || query.includes("music") || query.includes("audio")) {
    return insights.songs.length ? `Songs: ${insights.songs.map((item) => `${item.name} in ${folderName(item.parentId)}`).join(", ")}.` : "No uploaded songs yet.";
  }
  if (query.includes("large") || query.includes("storage") || query.includes("space")) {
    return `You are using ${formatBytes(totalStoredBytes())}. Largest files: ${insights.largest.map((item) => `${item.name} (${formatBytes(item.size)})`).join(", ") || "none"}.`;
  }
  if (query.includes("folder") || query.includes("organize")) {
    return insights.folderSuggestions.length ? `I suggest folders: ${insights.folderSuggestions.join(", ")}. Use AI organize files to move root files automatically.` : "Your root folder is already organized or empty.";
  }
  if (query.includes("cleanup") || query.includes("clean")) return cleanupPlanText();
  if (query.includes("playlist") || query.includes("queue") || query.includes("watch")) return mediaQueueText();
  if (query.includes("security") || query.includes("safe") || query.includes("privacy")) return securityScanText();

  const matches = filesOnly().filter((item) => item.name.toLowerCase().includes(query) || folderName(item.parentId).toLowerCase().includes(query) || (item.extension || "").toLowerCase().includes(query)).slice(0, 8);
  if (matches.length) return `Smart search found: ${matches.map((item) => `${item.name} in ${folderName(item.parentId)}`).join(", ")}.`;

  return `Vault summary: ${insights.files.length} files, ${foldersOnly().length} folders, ${formatBytes(totalStoredBytes())} used. Ask about duplicates, movies, songs, folders, or storage for more detail.`;
}

function cleanupPlanText() {
  const duplicates = duplicateGroups();
  const missing = filesMissingBlobs();
  const oldLarge = oldLargeFiles();
  const uncategorized = buildAiInsights().uncategorized;
  const steps = [];

  if (duplicates.length) steps.push(`Review ${duplicates.length} possible duplicate group(s) before deleting copies.`);
  if (oldLarge.length) steps.push(`Archive or compress large older files: ${oldLarge.map((item) => item.name).join(", ")}.`);
  if (uncategorized.length) steps.push(`Run AI organize to move ${uncategorized.length} root file(s) into smart folders.`);
  if (missing.length) steps.push(`Re-upload ${missing.length} file(s) whose blobs are unavailable in this browser.`);

  return steps.length ? `Cleanup plan: ${steps.join(" ")}` : "Cleanup plan: your vault looks tidy. No duplicates, missing blobs, or root files need attention.";
}

function mediaQueueText() {
  const videos = buildAiInsights().videos.slice(0, 5);
  const songs = buildAiInsights().songs.slice(0, 8);
  const parts = [];
  if (videos.length) parts.push(`Movie queue: ${videos.map((item) => item.name).join(" → ")}`);
  if (songs.length) parts.push(`Music queue: ${songs.map((item) => item.name).join(" → ")}`);
  return parts.length ? parts.join(". ") : "Upload movies or songs and I will build a watch/listen queue.";
}

function securityScanText() {
  const missing = filesMissingBlobs();
  const extensionSummary = extensionGroups().slice(0, 5).map((group) => `${group.label}: ${group.count}`).join(", ") || "none";
  const notes = [
    "Account data is scoped to the signed-in local user and passwords are PBKDF2-hashed before local storage.",
    missing.length ? `${missing.length} metadata record(s) are missing browser file bytes and should be re-uploaded.` : "All loaded file records have browser blobs available for playback/download.",
    `Top extensions scanned: ${extensionSummary}.`,
  ];
  return `Security scan: ${notes.join(" ")}`;
}

function smartSummaryText() {
  const stats = buildDashboardStats();
  const largest = stats.largest.map((item) => `${item.name} (${formatBytes(item.size)})`).join(", ") || "none";
  return `Smart summary: ${stats.files} files across ${stats.folders} folders using ${formatBytes(stats.storage)}. Media mix is ${stats.videos.length} movies, ${stats.songs.length} songs, and ${stats.docs.length} other files. Largest files: ${largest}.`;
}

function setAiResponse(response) {
  state.aiResponse = response;
  renderApp();
}

function createFolderForName(name) {
  let folder = state.items.find((item) => item.type === "folder" && item.parentId === "root" && item.name.toLowerCase() === name.toLowerCase());
  if (folder) return folder;

  folder = {
    id: crypto.randomUUID(),
    type: "folder",
    name,
    parentId: "root",
    ownerId: state.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    size: 0,
  };
  state.items.push(folder);
  return folder;
}

function createSuggestedFolders() {
  const names = buildAiInsights().folderSuggestions;
  names.forEach(createFolderForName);
  saveItems();
  state.aiResponse = names.length ? `Created or confirmed folders: ${names.join(", ")}.` : "No folder suggestions yet. Upload files first.";
  renderApp();
}

function organizeFilesWithAi() {
  let moved = 0;
  filesOnly().forEach((item) => {
    if (item.parentId !== "root") return;
    const folder = createFolderForName(suggestedFolderName(item));
    item.parentId = folder.id;
    item.updatedAt = new Date().toISOString();
    moved += 1;
  });

  saveItems();
  state.currentFolderId = "root";
  state.selectedItemId = null;
  state.aiResponse = moved ? `AI organized ${moved} root file(s) into smart folders.` : "Nothing to organize right now.";
  renderApp();
}

function downloadVaultIndex() {
  const payload = {
    exportedAt: new Date().toISOString(),
    user: { id: state.user.id, email: state.user.email, displayName: state.user.displayName },
    items: state.items.map(({ file, objectUrl, ...item }) => ({ ...item, folder: folderName(item.parentId) })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cloudbox-vault-index.json";
  link.click();
  URL.revokeObjectURL(url);
}

function createFolder(name) {
  const trimmed = name.trim();
  if (!trimmed) return;

  state.items.push({
    id: crypto.randomUUID(),
    type: "folder",
    name: trimmed,
    parentId: state.currentFolderId,
    ownerId: state.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    size: 0,
  });

  saveItems();
  render();
}

function renameItem(itemId, name) {
  const item = state.items.find((entry) => entry.id === itemId);
  const trimmed = name.trim();
  if (!item || !trimmed) return;

  item.name = trimmed;
  item.updatedAt = new Date().toISOString();
  saveItems();
  render();
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const now = new Date().toISOString();
  const newItems = files.map((file) => ({
    id: crypto.randomUUID(),
    type: mediaKind(file),
    name: file.name,
    parentId: state.currentFolderId,
    ownerId: state.user.id,
    createdAt: now,
    updatedAt: now,
    size: file.size,
    mime: file.type || "application/octet-stream",
    extension: extensionFor(file.name),
    file,
    objectUrl: URL.createObjectURL(file),
  }));

  await Promise.all(newItems.map((item) => putStoredFile(item.id, item.file)));
  state.items.push(...newItems);
  state.selectedItemId = newItems[0].id;
  saveItems();
  render();
}

async function removeItem(itemId) {
  const ids = new Set([itemId]);
  let changed = true;

  while (changed) {
    changed = false;
    state.items.forEach((item) => {
      if (ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    });
  }

  const deletedItems = state.items.filter((item) => ids.has(item.id));

  deletedItems
    .filter((item) => item.objectUrl)
    .forEach((item) => URL.revokeObjectURL(item.objectUrl));

  await Promise.all(deletedItems.filter((item) => item.type !== "folder").map((item) => deleteStoredFile(item.id)));

  state.items = state.items.filter((item) => !ids.has(item.id));
  if (ids.has(state.selectedItemId)) state.selectedItemId = null;
  if (ids.has(state.currentFolderId)) state.currentFolderId = "root";
  saveItems();
  render();
}

function iconFor(item) {
  if (item.type === "folder") return "📁";
  if (item.type === "video") return "🎬";
  if (item.type === "audio") return "🎵";
  return "📄";
}

function selectedItem() {
  return state.items.find((item) => item.id === state.selectedItemId);
}

function renderMediaControls(item, kind) {
  const supportNote = item.extension && ["avi", "mkv", "flac"].includes(item.extension)
    ? `<p class="support-note">${escapeHtml(item.extension.toUpperCase())} is accepted, but playback depends on your browser codec support.</p>`
    : "";

  return `
    <${kind} id="previewMedia" controls src="${item.objectUrl}"></${kind}>
    <div class="custom-controls" aria-label="Media playback controls">
      <button id="playToggle" type="button">Play</button>
      <span id="currentTime">0:00</span>
      <input id="seekControl" type="range" min="0" max="100" value="0" aria-label="Seek" />
      <span id="durationTime">0:00</span>
      <label>Volume <input id="volumeControl" type="range" min="0" max="1" value="1" step="0.01" aria-label="Volume" /></label>
    </div>
    ${supportNote}
  `;
}

function renderPreview(item) {
  const safeName = item ? escapeHtml(item.name) : "";
  const safeMime = item ? escapeHtml(item.mime || "") : "";

  if (!item) {
    return `
      <div class="empty-preview">
        <span>☁️</span>
        <h2>Select a movie, song, or file</h2>
        <p>Uploaded media can be streamed instantly and is restored from your private account storage when you return.</p>
      </div>
    `;
  }

  if (!item.objectUrl) {
    return `
      <div class="empty-preview">
        <span>${iconFor(item)}</span>
        <h2>${safeName}</h2>
        <p>The metadata is available, but this browser did not return the stored file bytes. Re-upload to play or download it.</p>
      </div>
    `;
  }

  if (item.type === "video") {
    return `
      <div class="player-card">
        <p class="eyebrow">Movie streamer</p>
        <h2>${safeName}</h2>
        ${renderMediaControls(item, "video")}
      </div>
    `;
  }

  if (item.type === "audio") {
    return `
      <div class="player-card audio-card">
        <p class="eyebrow">Music player</p>
        <h2>${safeName}</h2>
        <div class="album-art">🎧</div>
        ${renderMediaControls(item, "audio")}
      </div>
    `;
  }

  return `
    <div class="player-card">
      <p class="eyebrow">File preview</p>
      <h2>${safeName}</h2>
      <p>${safeMime} · ${formatBytes(item.size)}</p>
      <a class="download-link" href="${item.objectUrl}" download="${safeName}">Download file</a>
    </div>
  `;
}

function renderTreeNode(folder, level = 0) {
  const folderChildren = childrenOf(folder.id).filter((item) => item.type === "folder");
  const isActive = folder.id === state.currentFolderId;

  return `
    <li>
      <button class="tree-node ${isActive ? "active" : ""}" style="--level: ${level}" data-folder-id="${folder.id}">
        <span>📁</span>${escapeHtml(folder.name)}
      </button>
      ${folderChildren.length ? `<ul>${folderChildren.map((child) => renderTreeNode(child, level + 1)).join("")}</ul>` : ""}
    </li>
  `;
}

function renderInstallPanel() {
  return `
    <section class="install-panel" aria-label="Download app options">
      <div>
        <p class="eyebrow">Download app</p>
        <h2>Install for Android or PC</h2>
        <p>Use the PWA install button for a home-screen Android app or a desktop app shortcut on Chrome/Edge.</p>
        <small>${escapeHtml(state.installStatus)}</small>
      </div>
      <div class="install-actions">
        <button id="installAppButton" type="button">Install app</button>
        <button id="downloadManifestButton" type="button">Download manifest</button>
      </div>
    </section>
  `;
}

function renderAuth() {
  const isSignup = state.authMode === "signup";
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card">
        <p class="eyebrow">Secure account vault</p>
        <h1>${isSignup ? "Create your vault" : "Welcome back"}</h1>
        <p>Sign in to keep your uploads separated from every other account on this device.</p>
        <form id="authForm" class="auth-form">
          ${isSignup ? `<input id="displayName" type="text" placeholder="Display name" autocomplete="name" required />` : ""}
          <input id="email" type="email" placeholder="Email" autocomplete="email" required />
          <input id="password" type="password" placeholder="Password" autocomplete="current-password" minlength="8" required />
          ${state.authError ? `<div class="form-error">${escapeHtml(state.authError)}</div>` : ""}
          <button type="submit">${isSignup ? "Sign up" : "Log in"}</button>
        </form>
        <div class="auth-divider"><span>or</span></div>
        <section class="google-auth-card" aria-label="Google sign-in">
          <div id="googleSignInButton"></div>
          <small id="googleAuthStatus">${escapeHtml(state.googleAuthStatus || "Google sign-in is optional and needs a Google OAuth web client ID.")}</small>
        </section>
        <section class="preview-auth-card" aria-label="Dashboard preview">
          <strong>Want to see the dashboard first?</strong>
          <p>Open a no-login preview with sample movies, songs, files, AI health, media mix, and cleanup cards.</p>
          <button id="previewDashboardButton" type="button">Open dashboard preview</button>
        </section>
        <button id="toggleAuth" class="text-button" type="button">
          ${isSignup ? "Already have an account? Log in" : "Need an account? Sign up"}
        </button>
        <small class="auth-note">Passwords are hashed with PBKDF2 before being stored locally. For production, pair this UI with a server-side auth provider.</small>
      </section>
    </main>
  `;

  bindAuthEvents();
  initGoogleAuth();
}

function renderApp() {
  const selected = selectedItem();
  const children = childrenOf(state.currentFolderId);
  const folders = state.items.filter((item) => item.type === "folder").length;
  const files = state.items.filter((item) => item.type !== "folder").length;
  const rootFolder = { id: "root", name: "My Vault", parentId: null, type: "folder" };

  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <div>
          <p class="eyebrow">Private browser storage</p>
          <h1>CloudBox Media Vault</h1>
          <p class="hero-copy">${state.previewMode ? "Preview the dashboard with sample media, storage stats, AI cleanup, and folder hierarchy before creating your vault." : "Upload movies, songs, and documents into user-protected folders, then stream or download them from your vault."}</p>
        </div>
        <div class="account-card">
          <span>${state.previewMode ? "Previewing as" : "Signed in as"}</span>
          <strong>${escapeHtml(state.user.displayName || state.user.email)}</strong>
          <small>${escapeHtml(state.user.email)}</small>
          <button id="logoutButton" type="button">${state.previewMode ? "Exit preview" : "Log out"}</button>
        </div>
      </section>

      ${state.previewMode ? `<section class="preview-banner"><strong>Dashboard preview mode</strong><span>Sample data only. Create an account to upload and save real files.</span></section>` : ""}
      ${renderDashboard()}

      <section class="toolbar" aria-label="Upload and folder actions">
        <label class="upload-zone" for="fileUpload">
          <input id="fileUpload" type="file" multiple />
          <span>⬆️ Upload into ${escapeHtml(currentFolder().name)}</span>
          <small>Movies, songs, documents, and drag-and-drop are supported.</small>
        </label>
        <form id="folderForm" class="folder-form">
          <input id="folderName" type="text" placeholder="New folder name" aria-label="New folder name" />
          <button type="submit">Create folder</button>
        </form>
      </section>

      <section class="stats-grid" aria-label="Vault stats">
        <div><strong>${formatBytes(totalStoredBytes())}</strong><span>Storage used</span></div>
        <div><strong>${files}</strong><span>Files</span></div>
        <div><strong>${folders}</strong><span>Folders</span></div>
      </section>

      <section class="smart-grid">
        ${renderAiInsights()}
        ${renderInstallPanel()}
      </section>

      <section class="workspace">
        <aside class="tree-panel" aria-label="Folder hierarchy">
          <div class="panel-heading">
            <p class="eyebrow">Folders</p>
            <strong>Hierarchy</strong>
          </div>
          <ul class="folder-tree">${renderTreeNode(rootFolder)}</ul>
        </aside>

        <section class="browser-panel">
          <nav class="breadcrumbs" aria-label="Folder path">
            ${folderPath()
              .map((folder) => `<button data-folder-id="${folder.id}">${escapeHtml(folder.name)}</button>`)
              .join("<span>/</span>")}
          </nav>
          <div id="dropTarget" class="file-list ${children.length ? "" : "empty"}">
            ${
              children.length
                ? children
                    .map(
                      (item) => `
                        <article class="file-row ${item.id === state.selectedItemId ? "active" : ""}" data-item-id="${item.id}" data-item-type="${item.type}">
                          <button class="file-main" type="button">
                            <span class="file-icon">${iconFor(item)}</span>
                            <span>
                              <strong>${escapeHtml(item.name)}</strong>
                              <small>${item.type === "folder" ? `${childrenOf(item.id).length} item(s)` : `${escapeHtml(item.mime)} · ${formatBytes(item.size)}`}</small>
                            </span>
                          </button>
                          <div class="row-actions">
                            ${item.type !== "folder" && item.objectUrl ? `<a href="${item.objectUrl}" download="${escapeHtml(item.name)}" aria-label="Download ${escapeHtml(item.name)}">↓</a>` : ""}
                            <button class="rename-btn" type="button" data-rename-id="${item.id}" aria-label="Rename ${escapeHtml(item.name)}">✎</button>
                            <button class="delete-btn" type="button" data-delete-id="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button>
                          </div>
                        </article>
                      `,
                    )
                    .join("")
                : `<div class="empty-folder"><span>📦</span><p>This folder is empty. Upload files or create a folder to begin.</p></div>`
            }
          </div>
        </section>

        <section class="preview-panel" aria-live="polite">
          ${renderPreview(selected)}
        </section>
      </section>
    </main>
  `;

  bindAppEvents();
  bindMediaControls();
}

function render() {
  if (!state.user) {
    renderAuth();
  } else {
    renderApp();
  }
}

async function signUp(form) {
  const users = loadUsers();
  const email = form.email.value.trim().toLowerCase();
  const displayName = form.displayName.value.trim() || email.split("@")[0];
  const password = form.password.value;

  if (password.length < 8) {
    state.authError = "Password must be at least 8 characters.";
    renderAuth();
    return;
  }

  if (users.some((user) => user.email === email)) {
    state.authError = "An account already exists for this email.";
    renderAuth();
    return;
  }

  const { salt, hash } = await hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email,
    displayName,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  saveUsers(users);
  sessionStorage.setItem(SESSION_KEY, user.id);
  await loadUserSession(user);
}

async function logIn(form) {
  const users = loadUsers();
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  const user = users.find((entry) => entry.email === email && entry.passwordHash);

  if (!user || !(await verifyPassword(password, user))) {
    state.authError = "Invalid email or password.";
    renderAuth();
    return;
  }

  sessionStorage.setItem(SESSION_KEY, user.id);
  await loadUserSession(user);
}

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });
}

async function handleGoogleCredential(response) {
  const profile = decodeJwtPayload(response.credential || "");
  if (!profile?.sub || !profile?.email) {
    state.googleAuthStatus = "Google did not return a usable profile. Try again or use email login.";
    renderAuth();
    return;
  }

  const users = loadUsers();
  let user = users.find((entry) => entry.googleSub === profile.sub) || users.find((entry) => entry.email === profile.email.toLowerCase());

  if (user) {
    user.googleSub = profile.sub;
    user.provider = user.provider || "google";
    user.displayName = user.displayName || profile.name || profile.email.split("@")[0];
    user.picture = profile.picture || user.picture;
    user.updatedAt = new Date().toISOString();
  } else {
    user = {
      id: `google:${profile.sub}`,
      provider: "google",
      googleSub: profile.sub,
      email: profile.email.toLowerCase(),
      displayName: profile.name || profile.email.split("@")[0],
      picture: profile.picture || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.push(user);
  }

  saveUsers(users);
  sessionStorage.setItem(SESSION_KEY, user.id);
  state.googleAuthStatus = "Signed in with Google.";
  await loadUserSession(user);
}

async function initGoogleAuth() {
  const clientId = googleClientId();
  const buttonHost = document.getElementById("googleSignInButton");
  if (!buttonHost) return;

  if (!clientId) {
    state.googleAuthStatus = "Add GOOGLE_CLIENT_ID to enable Google sign-in.";
    buttonHost.innerHTML = `<button class="google-disabled" type="button" disabled>Configure Google Client ID</button>`;
    document.getElementById("googleAuthStatus").textContent = state.googleAuthStatus;
    return;
  }

  state.googleAuthStatus = "Loading Google sign-in...";
  document.getElementById("googleAuthStatus").textContent = state.googleAuthStatus;

  try {
    await loadGoogleScript();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      auto_select: false,
      context: state.authMode === "signup" ? "signup" : "signin",
    });
    buttonHost.innerHTML = "";
    window.google.accounts.id.renderButton(buttonHost, { theme: "outline", size: "large", type: "standard", width: 320 });
    state.googleAuthStatus = "Google sign-in is ready.";
  } catch (error) {
    state.googleAuthStatus = "Google sign-in could not load. Check your network and Client ID.";
  }

  const status = document.getElementById("googleAuthStatus");
  if (status) status.textContent = state.googleAuthStatus;
}

async function loadUserSession(user) {
  revokeObjectUrls();
  state.user = user;
  state.items = loadItems();
  state.currentFolderId = "root";
  state.selectedItemId = null;
  state.authError = "";
  state.previewMode = false;
  await hydrateStoredFiles();
  render();
}

function logOut() {
  revokeObjectUrls();
  sessionStorage.removeItem(SESSION_KEY);
  state.previewMode = false;
  state.user = null;
  state.items = [];
  state.currentFolderId = "root";
  state.selectedItemId = null;
  render();
}

function bindAuthEvents() {
  document.getElementById("previewDashboardButton").addEventListener("click", openDashboardPreview);

  document.getElementById("toggleAuth").addEventListener("click", () => {
    state.authMode = state.authMode === "login" ? "signup" : "login";
    state.authError = "";
    renderAuth();
  });

  document.getElementById("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.authMode === "signup") {
      await signUp(event.currentTarget);
    } else {
      await logIn(event.currentTarget);
    }
  });
}

function bindAppEvents() {
  document.getElementById("logoutButton").addEventListener("click", logOut);
  document.getElementById("fileUpload").addEventListener("change", async (event) => {
    await addFiles(event.target.files);
    event.target.value = "";
  });
  document.getElementById("folderForm").addEventListener("submit", (event) => {
    event.preventDefault();
    createFolder(document.getElementById("folderName").value);
    event.currentTarget.reset();
  });

  document.getElementById("aiForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.aiPrompt = document.getElementById("aiPrompt").value;
    state.aiResponse = answerVaultQuestion(state.aiPrompt);
    renderApp();
  });

  document.getElementById("organizeButton").addEventListener("click", organizeFilesWithAi);
  document.getElementById("suggestFoldersButton").addEventListener("click", createSuggestedFolders);
  document.getElementById("exportVaultButton").addEventListener("click", downloadVaultIndex);
  document.getElementById("smartSummaryButton").addEventListener("click", () => setAiResponse(smartSummaryText()));
  document.getElementById("cleanupPlanButton").addEventListener("click", () => setAiResponse(cleanupPlanText()));
  document.getElementById("mediaQueueButton").addEventListener("click", () => setAiResponse(mediaQueueText()));
  document.getElementById("securityScanButton").addEventListener("click", () => setAiResponse(securityScanText()));
  document.getElementById("installAppButton").addEventListener("click", installApp);
  document.getElementById("downloadManifestButton").addEventListener("click", downloadManifest);

  document.querySelectorAll("[data-folder-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentFolderId = button.dataset.folderId;
      state.selectedItemId = null;
      renderApp();
    });
  });

  document.querySelectorAll(".file-row").forEach((row) => {
    row.querySelector(".file-main").addEventListener("click", () => {
      if (row.dataset.itemType === "folder") {
        state.currentFolderId = row.dataset.itemId;
        state.selectedItemId = null;
      } else {
        state.selectedItemId = row.dataset.itemId;
      }
      renderApp();
    });
  });

  document.querySelectorAll("[data-rename-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = state.items.find((entry) => entry.id === button.dataset.renameId);
      const newName = prompt(`Rename ${item.type}`, item.name);
      if (newName) renameItem(item.id, newName);
    });
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = state.items.find((entry) => entry.id === button.dataset.deleteId);
      if (confirm(`Delete ${item.name}${item.type === "folder" ? " and everything inside it" : ""}?`)) {
        removeItem(button.dataset.deleteId);
      }
    });
  });

  const dropTarget = document.getElementById("dropTarget");
  ["dragenter", "dragover"].forEach((eventName) => {
    dropTarget.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropTarget.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropTarget.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropTarget.classList.remove("dragging");
    });
  });

  dropTarget.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
}

function formatTime(seconds = 0) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function bindMediaControls() {
  const media = document.getElementById("previewMedia");
  if (!media) return;

  const playToggle = document.getElementById("playToggle");
  const seekControl = document.getElementById("seekControl");
  const volumeControl = document.getElementById("volumeControl");
  const currentTime = document.getElementById("currentTime");
  const durationTime = document.getElementById("durationTime");

  const sync = () => {
    seekControl.max = media.duration || 100;
    seekControl.value = media.currentTime || 0;
    currentTime.textContent = formatTime(media.currentTime);
    durationTime.textContent = formatTime(media.duration);
    playToggle.textContent = media.paused ? "Play" : "Pause";
  };

  playToggle.addEventListener("click", () => {
    if (media.paused) {
      media.play();
    } else {
      media.pause();
    }
  });

  seekControl.addEventListener("input", () => {
    media.currentTime = Number(seekControl.value);
  });

  volumeControl.addEventListener("input", () => {
    media.volume = Number(volumeControl.value);
  });

  ["loadedmetadata", "timeupdate", "play", "pause", "ended"].forEach((eventName) => media.addEventListener(eventName, sync));
  sync();
}

async function installApp() {
  if (!state.installPrompt) {
    state.installStatus = "If the install prompt does not appear, use your browser menu: Install app, Add to Home Screen, or Create shortcut.";
    renderApp();
    return;
  }

  state.installPrompt.prompt();
  const choice = await state.installPrompt.userChoice;
  state.installStatus = choice.outcome === "accepted" ? "CloudBox install started." : "Install was dismissed. You can try again later.";
  state.installPrompt = null;
  renderApp();
}

function manifestPayload() {
  return {
    name: "CloudBox Media Vault",
    short_name: "CloudBox",
    description: "Installable private media vault with AI organization tools.",
    start_url: window.location.href,
    display: "standalone",
    background_color: "#08111f",
    theme_color: "#08111f",
    icons: [{ src: new URL("./icon.svg", import.meta.url).href, sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
  };
}

function attachManifest() {
  const blob = new Blob([JSON.stringify(manifestPayload(), null, 2)], { type: "application/manifest+json" });
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = URL.createObjectURL(blob);
  document.head.appendChild(link);
}

function downloadManifest() {
  const blob = new Blob([JSON.stringify(manifestPayload(), null, 2)], { type: "application/manifest+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cloudbox-manifest.webmanifest";
  link.click();
  URL.revokeObjectURL(url);
}

function registerPwa() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    state.installStatus = "Ready to install on Android or PC.";
    if (state.user) renderApp();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("./service-worker.js", import.meta.url));
  }
}

async function restoreSession() {
  const sessionUserId = sessionStorage.getItem(SESSION_KEY);
  const user = loadUsers().find((entry) => entry.id === sessionUserId);

  if (user) {
    await loadUserSession(user);
  } else {
    renderAuth();
  }
}

attachManifest();
registerPwa();
restoreSession();
