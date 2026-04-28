(function () {
    'use strict';

    var currentUser = null;
    var nodes = new Map();
    var edges = new Map();
    var pan = { x: 0, y: 0 };
    var zoom = 1;
    var mode = 'select'; // 'select' | 'connect'
    var connectFrom = null;
    var dragging = false;
    var dragTarget = null; // 'pan' | node id
    var dragStart = { x: 0, y: 0 };
    var dragOrigin = { x: 0, y: 0 };
    var saveTimer = null;

    var app = document.getElementById('app');
    var loadingEl = document.getElementById('loading');
    var viewport = document.getElementById('canvas-viewport');
    var world = document.getElementById('canvas-world');
    var edgesSvg = document.getElementById('canvas-edges');
    var nodesDiv = document.getElementById('canvas-nodes');

    requireAuth(function (user) {
        currentUser = user;
        loadingEl.classList.add('hidden');
        app.classList.remove('hidden');
        loadCanvas();
        bindEvents();
    });


    function uid() {
        return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function esc(t) {
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    // --- Transform ---

    function applyTransform() {
        world.style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')';
    }

    // --- Events ---

    function bindEvents() {
        // Pan start
        viewport.addEventListener('mousedown', function (e) {
            var t = e.target;
            if (t === viewport || t === world || t === edgesSvg || t === nodesDiv) {
                dragging = true;
                dragTarget = 'pan';
                dragStart = { x: e.clientX, y: e.clientY };
                dragOrigin = { x: pan.x, y: pan.y };
                viewport.classList.add('grabbing');
            }
        });

        // Move
        window.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - dragStart.x;
            var dy = e.clientY - dragStart.y;
            if (dragTarget === 'pan') {
                pan.x = dragOrigin.x + dx;
                pan.y = dragOrigin.y + dy;
                applyTransform();
            } else {
                var node = nodes.get(dragTarget);
                if (node) {
                    node.x = dragOrigin.x + dx / zoom;
                    node.y = dragOrigin.y + dy / zoom;
                    positionNode(node);
                    drawEdges();
                    scheduleSave();
                }
            }
        });

        // End
        window.addEventListener('mouseup', function () {
            dragging = false;
            dragTarget = null;
            viewport.classList.remove('grabbing');
        });

        // Touch pan
        viewport.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) return;
            var t = e.target;
            if (t === viewport || t === world || t === edgesSvg || t === nodesDiv) {
                dragging = true;
                dragTarget = 'pan';
                dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                dragOrigin = { x: pan.x, y: pan.y };
            }
        }, { passive: true });

        window.addEventListener('touchmove', function (e) {
            if (!dragging || !e.touches.length) return;
            var dx = e.touches[0].clientX - dragStart.x;
            var dy = e.touches[0].clientY - dragStart.y;
            if (dragTarget === 'pan') {
                pan.x = dragOrigin.x + dx;
                pan.y = dragOrigin.y + dy;
                applyTransform();
            } else {
                var node = nodes.get(dragTarget);
                if (node) {
                    node.x = dragOrigin.x + dx / zoom;
                    node.y = dragOrigin.y + dy / zoom;
                    positionNode(node);
                    drawEdges();
                    scheduleSave();
                }
            }
        }, { passive: true });

        window.addEventListener('touchend', function () {
            dragging = false;
            dragTarget = null;
        });

        // Zoom
        viewport.addEventListener('wheel', function (e) {
            e.preventDefault();
            var factor = e.deltaY > 0 ? 0.92 : 1.08;
            var nz = Math.max(0.1, Math.min(5, zoom * factor));
            var rect = viewport.getBoundingClientRect();
            var cx = e.clientX - rect.left;
            var cy = e.clientY - rect.top;
            pan.x = cx - (cx - pan.x) * (nz / zoom);
            pan.y = cy - (cy - pan.y) * (nz / zoom);
            zoom = nz;
            applyTransform();
        }, { passive: false });

        // Double-click: add node
        viewport.addEventListener('dblclick', function (e) {
            var t = e.target;
            if (t !== viewport && t !== world && t !== edgesSvg && t !== nodesDiv) return;
            var rect = viewport.getBoundingClientRect();
            var x = (e.clientX - rect.left - pan.x) / zoom;
            var y = (e.clientY - rect.top - pan.y) / zoom;
            createNode(null, x, y, 'New node', null);
        });

        // Toolbar
        document.getElementById('btn-import').addEventListener('click', importEntries);

        document.getElementById('btn-add-node').addEventListener('click', function () {
            var rect = viewport.getBoundingClientRect();
            var x = (rect.width / 2 - pan.x) / zoom;
            var y = (rect.height / 2 - pan.y) / zoom;
            createNode(null, x, y, 'New node', null);
        });

        document.getElementById('btn-connect').addEventListener('click', function () {
            mode = mode === 'connect' ? 'select' : 'connect';
            this.classList.toggle('btn-primary', mode === 'connect');
            connectFrom = null;
            clearNodeSelection();
        });

        document.getElementById('btn-reset').addEventListener('click', function () {
            pan = { x: 0, y: 0 };
            zoom = 1;
            applyTransform();
        });
    }

    // --- Nodes ---

    function createNode(entryId, x, y, label, date) {
        var id = uid();
        var node = { id: id, entryId: entryId, x: x, y: y, label: label, date: date };
        nodes.set(id, node);
        renderNode(node);
        scheduleSave();
        return node;
    }

    function renderNode(node) {
        var el = document.getElementById('nd-' + node.id);
        if (!el) {
            el = document.createElement('div');
            el.className = 'canvas-node';
            el.id = 'nd-' + node.id;

            // Drag
            el.addEventListener('mousedown', function (e) {
                e.stopPropagation();
                if (mode === 'connect') { onNodeClick(node.id); return; }
                dragging = true;
                dragTarget = node.id;
                dragStart = { x: e.clientX, y: e.clientY };
                dragOrigin = { x: node.x, y: node.y };
            });

            el.addEventListener('touchstart', function (e) {
                e.stopPropagation();
                if (mode === 'connect') { onNodeClick(node.id); return; }
                dragging = true;
                dragTarget = node.id;
                dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                dragOrigin = { x: node.x, y: node.y };
            }, { passive: true });

            // Edit on double-click
            el.addEventListener('dblclick', function (e) {
                e.stopPropagation();
                var txt = prompt('Edit node:', node.label);
                if (txt !== null) {
                    node.label = txt;
                    renderNode(node);
                    scheduleSave();
                }
            });

            // Delete on right-click
            el.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                if (!confirm('Delete node?')) return;
                nodes.delete(node.id);
                edges.forEach(function (edge, eid) {
                    if (edge.from === node.id || edge.to === node.id) edges.delete(eid);
                });
                el.remove();
                drawEdges();
                scheduleSave();
            });

            nodesDiv.appendChild(el);
        }

        var html = '';
        if (node.date) html += '<div class="node-date">' + esc(node.date) + '</div>';
        html += '<div class="node-text">' + esc(node.label) + '</div>';
        el.innerHTML = html;
        positionNode(node);
    }

    function positionNode(node) {
        var el = document.getElementById('nd-' + node.id);
        if (el) {
            el.style.left = node.x + 'px';
            el.style.top = node.y + 'px';
        }
    }

    function onNodeClick(id) {
        if (!connectFrom) {
            connectFrom = id;
            var el = document.getElementById('nd-' + id);
            if (el) el.classList.add('selected');
        } else if (connectFrom !== id) {
            createEdge(connectFrom, id);
            clearNodeSelection();
            connectFrom = null;
        }
    }

    function clearNodeSelection() {
        document.querySelectorAll('.canvas-node.selected').forEach(function (n) {
            n.classList.remove('selected');
        });
    }

    // --- Edges ---

    function createEdge(from, to, label) {
        var id = uid();
        var edge = { id: id, from: from, to: to, label: label || '' };
        edges.set(id, edge);
        drawEdges();
        scheduleSave();

        if (!label) {
            setTimeout(function () {
                var lbl = prompt('Edge label (optional):');
                if (lbl) {
                    edge.label = lbl;
                    drawEdges();
                    scheduleSave();
                }
            }, 50);
        }
    }

    function drawEdges() {
        edgesSvg.innerHTML = '';

        edges.forEach(function (edge) {
            var fromNode = nodes.get(edge.from);
            var toNode = nodes.get(edge.to);
            if (!fromNode || !toNode) return;

            var fe = document.getElementById('nd-' + fromNode.id);
            var te = document.getElementById('nd-' + toNode.id);
            var fw = fe ? fe.offsetWidth / 2 : 40;
            var fh = fe ? fe.offsetHeight / 2 : 20;
            var tw = te ? te.offsetWidth / 2 : 40;
            var th = te ? te.offsetHeight / 2 : 20;

            var x1 = fromNode.x + fw, y1 = fromNode.y + fh;
            var x2 = toNode.x + tw, y2 = toNode.y + th;

            var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            edgesSvg.appendChild(line);

            // Label
            var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', mx);
            text.setAttribute('y', my - 5);
            text.setAttribute('text-anchor', 'middle');
            text.textContent = edge.label || '\u00B7';

            text.addEventListener('click', function () {
                var lbl = prompt('Edit edge label:', edge.label);
                if (lbl !== null) {
                    edge.label = lbl;
                    drawEdges();
                    scheduleSave();
                }
            });

            // Right-click to delete edge
            text.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                if (!confirm('Delete connection?')) return;
                edges.delete(edge.id);
                drawEdges();
                scheduleSave();
            });

            edgesSvg.appendChild(text);
        });
    }

    // --- Import entries ---

    async function importEntries() {
        var snap = await db.collection('users').doc(currentUser.uid)
            .collection('entries').orderBy('createdAt', 'desc').get();

        if (snap.empty) { alert('No entries to import.'); return; }

        var existing = new Set();
        nodes.forEach(function (n) { if (n.entryId) existing.add(n.entryId); });

        var rect = viewport.getBoundingClientRect();
        var cols = 4, spacing = 240;
        var startX = (rect.width / 2 - pan.x) / zoom - (cols * spacing) / 2;
        var startY = (rect.height / 2 - pan.y) / zoom - 100;
        var col = 0, row = 0, added = 0;

        snap.forEach(function (doc) {
            if (existing.has(doc.id)) return;
            var d = doc.data();
            var dateStr = '';
            if (d.createdAt) dateStr = d.createdAt.toDate().toLocaleDateString();
            var label = (d.content || '').slice(0, 80) || '[attachment]';

            createNode(doc.id, startX + col * spacing, startY + row * spacing, label, dateStr);
            col++;
            if (col >= cols) { col = 0; row++; }
            added++;
        });

        if (!added) alert('All entries already imported.');
    }

    // --- Persistence ---

    async function loadCanvas() {
        try {
            var doc = await db.collection('users').doc(currentUser.uid)
                .collection('canvas').doc('default').get();

            if (doc.exists) {
                var data = doc.data();
                if (data.nodes) data.nodes.forEach(function (n) { nodes.set(n.id, n); renderNode(n); });
                if (data.edges) data.edges.forEach(function (e) { edges.set(e.id, e); });
                if (data.pan) pan = data.pan;
                if (data.zoom) zoom = data.zoom;
                drawEdges();
                applyTransform();
            }
        } catch (err) {
            console.error('Load canvas failed:', err);
        }
    }

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveCanvas, 800);
    }

    async function saveCanvas() {
        try {
            await db.collection('users').doc(currentUser.uid)
                .collection('canvas').doc('default').set({
                    nodes: Array.from(nodes.values()),
                    edges: Array.from(edges.values()),
                    pan: pan,
                    zoom: zoom,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
        } catch (err) {
            console.error('Save canvas failed:', err);
        }
    }
})();
