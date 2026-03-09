import "./styles.css";

document.getElementById("app").innerHTML = `
  <main class="dashboard">
    <aside class="panel sidebar">
      <div class="brand">Nebula Drive <small>Portable + Cloud Ready</small></div>
      <nav>
        <div class="nav-item active">Home <span class="pill">Live</span></div>
        <div class="nav-item">Folders</div>
        <div class="nav-item">Media Player</div>
        <div class="nav-item">Upload Queue</div>
        <div class="nav-item">Favorites</div>
        <div class="nav-item">Shared Links</div>
        <div class="nav-item">Security Center</div>
      </nav>
      <div class="widget panel">
        <strong>Quick Modes</strong>
        <p class="foot-note">Cloud Sync ON • USB Portable Mode supported • Offline cache smart enabled.</p>
      </div>
    </aside>

    <section class="main">
      <header class="panel topbar">
        <input class="search" placeholder="AI search: photos from trip, invoices 2026, song by name..." />
        <div class="storage">
          <strong>398 GB / 1 TB used</strong>
          <div class="bar"><span></span></div>
        </div>
      </header>

      <div class="content-grid">
        <section class="panel workspace">
          <div class="section-title">
            <h3>Smart Workspace</h3>
            <span class="pill">Sort: Date ↓</span>
          </div>
          <div class="file-grid">
            ${[
              ["Family Highlights", "Folder", "24 items"],
              ["Summer Reel.mp4", "Video", "1.4 GB"],
              ["Roadtrip Mix", "Audio", "89 tracks"],
              ["Tax_Documents_2025", "Docs", "12 files"],
              ["Design Pack.zip", "Archive", "2.2 GB"],
              ["Product Demo.mov", "Video", "4K • 2.8 GB"]
            ]
              .map(
                ([name, type, meta]) => `
                <article class="file-card">
                  <div class="file-type">${type}</div>
                  <div class="file-name">${name}</div>
                  <div class="meta">${meta}</div>
                </article>
              `
              )
              .join("")}
          </div>
          <p class="foot-note">Drag and drop files anywhere in this area to upload in background.</p>
        </section>

        <aside class="side-panels">
          <section class="panel widget">
            <strong>Recent Activity</strong>
            <div class="activity-item"><span>Upload complete</span><span>2m ago</span></div>
            <div class="activity-item"><span>Shared link created</span><span>8m ago</span></div>
            <div class="activity-item"><span>Duplicate cleaned</span><span>27m ago</span></div>
            <div class="activity-item"><span>USB backup synced</span><span>1h ago</span></div>
          </section>

          <section class="panel media-player">
            <strong>Floating Media Deck</strong>
            <p class="foot-note">Now Playing: Midnight Skyline • Resume at 01:12:44</p>
            <div class="controls">
              <button class="btn">⏮</button>
              <button class="btn">⏯</button>
              <button class="btn">⏭</button>
            </div>
          </section>

          <section class="panel widget">
            <strong>Secure Sharing</strong>
            <p class="foot-note">Temporary links, QR transfer, and password-protected folder sharing are active.</p>
          </section>
        </aside>
      </div>
    </section>
  </main>
`;
