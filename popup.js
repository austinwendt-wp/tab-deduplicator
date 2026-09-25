// Known tracking/session params that carry no page identity — strip these only.
// Semantic params (q, id, page, s, …) are preserved so different searches/pages stay distinct.
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  'fbclid', 'gclid', 'msclkid', 'dclid', 'twclid', 'ttclid', 'li_fat_id',
  '_ga', '_gl', '_gid',
  'ref', 'referer', 'referral', 'referrer',
  'mc_eid', 'igshid', 'yclid', 'zanpid', 'srsltid',
]);

function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // Drop only known tracking params; keep everything else (q=, id=, page=, etc.).
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort(); // canonical param order so ?a=1&b=2 === ?b=2&a=1
    u.hash = '';
    const path = u.pathname.replace(/\/$/, '') || '/';
    const qs = u.searchParams.toString();
    return u.origin + path + (qs ? '?' + qs : '');
  } catch {
    return rawUrl;
  }
}

// Map windowId → human-readable label ("Window 1", "Window 2", …) in stable order.
function buildWindowLabels(tabs) {
  const order = [];
  for (const tab of tabs) {
    if (!order.includes(tab.windowId)) order.push(tab.windowId);
  }
  const labels = {};
  order.forEach((id, i) => { labels[id] = `Window ${i + 1}`; });
  return labels;
}

// Returns a compact relative-time string for a lastAccessed timestamp.
function formatAge(lastAccessed) {
  if (!lastAccessed) return null;
  const seconds = Math.floor((Date.now() - lastAccessed) / 1000);
  if (seconds < 60)  return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Group tabs by normalized URL, returning only groups with ≥ 2 tabs.
// Within each group tabs are sorted most-recently-accessed first so the
// "Keep 1" action always preserves the freshest tab.
function buildDuplicateGroups(tabs) {
  const map = new Map();
  for (const tab of tabs) {
    const key = normalizeUrl(tab.url || '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(tab);
  }
  return [...map.entries()]
    .filter(([, group]) => group.length >= 2)
    .map(([key, group]) => {
      // Sort: most recently accessed first (undefined lastAccessed sorts last).
      group.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
      return [key, group];
    })
    .sort((a, b) => b[1].length - a[1].length); // Most dupes first between groups.
}

function focusTab(tabId, windowId) {
  chrome.tabs.update(tabId, { active: true });
  chrome.windows.update(windowId, { focused: true });
  window.close();
}

async function closeTab(tabId) {
  await chrome.tabs.remove(tabId);
  render(); // Refresh after close.
}

async function deduplicateGroup(tabs) {
  // Keep the first tab (index 0), close the rest.
  const toClose = tabs.slice(1).map(t => t.id);
  await chrome.tabs.remove(toClose);
  render();
}

async function deduplicateAll(groups) {
  const toClose = groups.flatMap(([, tabs]) => tabs.slice(1).map(t => t.id));
  await chrome.tabs.remove(toClose);
  render();
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

async function render() {
  const tabs = await chrome.tabs.query({});
  const windowLabels = buildWindowLabels(tabs);
  const groups = buildDuplicateGroups(tabs);

  document.getElementById('total-tabs').textContent = `${tabs.length} tab${tabs.length !== 1 ? 's' : ''}`;
  document.getElementById('dup-sets').textContent =
    groups.length ? `${groups.length} duplicate set${groups.length !== 1 ? 's' : ''}` : 'no duplicates';

  const dedupAllBtn = document.getElementById('dedup-all');
  dedupAllBtn.disabled = groups.length === 0;
  dedupAllBtn.onclick = () => deduplicateAll(groups);

  const list = document.getElementById('group-list');
  const emptyState = document.getElementById('empty-state');
  list.innerHTML = '';

  if (groups.length === 0) {
    const msg = el('div', { className: 'empty-state' }, '✓ No duplicate tabs found.');
    list.appendChild(msg);
    return;
  }

  for (const [normalizedUrl, groupTabs] of groups) {
    // Use the first tab's title as the group heading, fall back to the URL.
    const groupTitle = groupTabs[0].title || normalizedUrl;
    const groupId = `group-${groupTabs[0].id}`;

    const summary = el('summary', { className: 'group-summary' },
      el('span', { className: 'group-title' }, groupTitle),
      el('span', { className: 'group-badge' }, `${groupTabs.length}`),
      el('button', {
        className: 'btn-dedup',
        title: 'Keep first tab, close the rest',
        onClick: (e) => { e.stopPropagation(); deduplicateGroup(groupTabs); },
      }, 'Keep 1'),
    );

    const tabRows = groupTabs.map((tab, i) => {
      const favicon = tab.favIconUrl
        ? el('img', { className: 'favicon', src: tab.favIconUrl, alt: '' })
        : el('span', { className: 'favicon-placeholder' });

      const age = formatAge(tab.lastAccessed);
      const label = el('span', { className: 'tab-label' },
        favicon,
        el('span', { className: 'tab-title' }, tab.title || tab.url || '(no title)'),
        el('span', { className: 'tab-window' }, windowLabels[tab.windowId]),
        age ? el('span', {
          className: 'tab-age',
          title: new Date(tab.lastAccessed).toLocaleString(),
          'data-stale': tab.lastAccessed && (Date.now() - tab.lastAccessed) > 86_400_000 ? '1' : '0',
        }, age) : null,
      );

      const closeBtn = el('button', {
        className: 'btn-close',
        title: 'Close this tab',
        onClick: (e) => { e.stopPropagation(); closeTab(tab.id); },
      }, '✕');

      const row = el('div', {
        className: `tab-row${i === 0 ? ' tab-row--keep' : ''}`,
        title: tab.url,
        onClick: () => focusTab(tab.id, tab.windowId),
      }, label, closeBtn);

      return row;
    });

    const details = el('details', { id: groupId, className: 'group', open: '' },
      summary,
      el('div', { className: 'tab-list' }, ...tabRows),
    );

    list.appendChild(details);
  }
}

document.addEventListener('DOMContentLoaded', render);
