(function () {
    'use strict';

    var currentUser = null;
    var map = null;
    var mapReady = false;
    var openPopup = null;

    // entries: [{ id, lat, lng, popupHtml, createdAt }]
    var entries = [];
    var entryById = {};

    // connections: [{ id, fromEntryId, toEntryId, note }]
    var connections = [];

    var currentIndex = -1;
    var connectMode = false;
    var pendingFromId = null;
    var filterDate = null;
    var flyToken = 0;

    var btnConnect = null;
    var banner = null;

    var minimalStyle = {
        version: 8,
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources: {
            openmaptiles: {
                type: 'vector',
                url: 'https://tiles.openfreemap.org/planet'
            }
        },
        layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#000' } },
            {
                id: 'streets',
                type: 'line',
                source: 'openmaptiles',
                'source-layer': 'transportation',
                paint: {
                    'line-color': '#666',
                    'line-opacity': 0.9,
                    'line-width': [
                        'interpolate', ['linear'], ['zoom'],
                        4,  0.1,
                        8,  0.25,
                        11, 0.45,
                        13, 0.7,
                        15, 1.0,
                        17, 1.6,
                        20, 2.6
                    ]
                },
                layout: {
                    'line-cap': 'round',
                    'line-join': 'round'
                }
            }
        ]
    };

    requireAuth(function (user) {
        currentUser = user;
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        initMap();
    });

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function renderAttachmentsHtml(atts) {
        if (!atts || !atts.length) return '';
        var html = '<div class="popup-attachments">';
        atts.forEach(function (att) {
            var src = att.data || att.url || '';
            if (!src) return;
            if (att.type && att.type.indexOf('image/') === 0) {
                html += '<img src="' + src + '" alt="" decoding="sync">';
            } else if (att.type && att.type.indexOf('audio/') === 0) {
                html += '<audio controls preload="metadata" src="' + src + '"></audio>';
            }
        });
        html += '</div>';
        return html;
    }

    function setBanner(text) {
        if (!text) { banner.classList.add('hidden'); banner.textContent = ''; return; }
        banner.textContent = text;
        banner.classList.remove('hidden');
    }

    function initMap() {
        map = new maplibregl.Map({
            container: 'map',
            style: minimalStyle,
            center: [90.4125, 23.8103],
            zoom: 11,
            minZoom: 2,
            maxZoom: 19,
            attributionControl: false,
            fadeDuration: 150,
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            maxPitch: 0,
            renderWorldCopies: false
        });

        btnConnect = document.getElementById('btn-connect');
        banner = document.getElementById('map-banner');

        btnConnect.addEventListener('click', toggleConnectMode);

        var dateInput = document.getElementById('filter-date');
        dateInput.addEventListener('change', function () {
            filterDate = dateInput.value || null;
            applyFilter();
        });

        document.getElementById('btn-clear-date').addEventListener('click', function () {
            dateInput.value = '';
            filterDate = null;
            applyFilter();
        });

        document.getElementById('btn-connect-all').addEventListener('click', chainVisible);

        document.getElementById('btn-prev-entry').addEventListener('click', function () {
            if (!entries.length) return;
            currentIndex--;
            if (currentIndex < 0) currentIndex = entries.length - 1;
            flyToEntry(currentIndex);
        });

        document.getElementById('btn-next-entry').addEventListener('click', function () {
            if (!entries.length) return;
            currentIndex++;
            if (currentIndex >= entries.length) currentIndex = 0;
            flyToEntry(currentIndex);
        });

        map.on('load', function () {
            mapReady = true;

            map.addSource('connections', { type: 'geojson', data: emptyFC() });
            map.addSource('entries',     { type: 'geojson', data: emptyFC() });

            map.addLayer({
                id: 'connections-lines',
                type: 'line',
                source: 'connections',
                paint: {
                    'line-color': '#8B2252',
                    'line-width': 1.5,
                    'line-opacity': 0.7
                },
                layout: { 'line-cap': 'round', 'line-join': 'round' }
            });

            map.addLayer({
                id: 'entries-circles',
                type: 'circle',
                source: 'entries',
                paint: {
                    'circle-radius': 5,
                    'circle-color': '#8B2252',
                    'circle-opacity': 0.95,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#8B2252'
                }
            });

            map.addLayer({
                id: 'entries-highlight',
                type: 'circle',
                source: 'entries',
                filter: ['==', ['get', 'id'], '__none__'],
                paint: {
                    'circle-radius': 8,
                    'circle-color': 'rgba(0,0,0,0)',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });

            map.on('click', 'entries-circles', onEntryClick);
            map.on('click', 'connections-lines', onConnectionClick);

            var canvasEl = map.getCanvas();
            map.on('mouseenter', 'entries-circles',     function () { canvasEl.style.cursor = 'pointer'; });
            map.on('mouseleave', 'entries-circles',     function () { canvasEl.style.cursor = ''; });
            map.on('mouseenter', 'connections-lines',   function () { canvasEl.style.cursor = 'pointer'; });
            map.on('mouseleave', 'connections-lines',   function () { canvasEl.style.cursor = ''; });

            loadEntries().then(loadConnections);
        });
    }

    function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

    function visibleEntries() { return entries.filter(entryMatchesFilter); }

    function buildEntriesGeoJSON() {
        return {
            type: 'FeatureCollection',
            features: visibleEntries().map(function (e) {
                return {
                    type: 'Feature',
                    properties: { id: e.id },
                    geometry: { type: 'Point', coordinates: [e.lng, e.lat] }
                };
            })
        };
    }

    function buildConnectionsGeoJSON() {
        var visible = {};
        visibleEntries().forEach(function (e) { visible[e.id] = true; });
        return {
            type: 'FeatureCollection',
            features: connections
                .map(function (c) {
                    if (!visible[c.fromEntryId] || !visible[c.toEntryId]) return null;
                    var a = entryById[c.fromEntryId];
                    var b = entryById[c.toEntryId];
                    if (!a || !b) return null;
                    return {
                        type: 'Feature',
                        properties: { id: c.id },
                        geometry: {
                            type: 'LineString',
                            coordinates: [[a.lng, a.lat], [b.lng, b.lat]]
                        }
                    };
                })
                .filter(Boolean)
        };
    }

    function refreshSources() {
        if (!mapReady) return;
        map.getSource('entries').setData(buildEntriesGeoJSON());
        map.getSource('connections').setData(buildConnectionsGeoJSON());
    }

    function entryMatchesFilter(e) {
        if (!filterDate) return true;
        return localDateKey(e.createdAt) === filterDate;
    }

    function localDateKey(d) {
        if (!d) return null;
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function applyFilter() {
        refreshSources();
        var visibleCount = visibleEntries().length;
        var countEl = document.getElementById('entry-count');
        if (filterDate) {
            countEl.textContent = visibleCount + ' on ' + filterDate;
        } else if (entries.length > 0) {
            countEl.textContent = entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies');
        }
    }

    function flyToEntry(idx) {
        var e = entries[idx];
        var token = ++flyToken;
        if (openPopup) { openPopup.remove(); openPopup = null; }
        map.flyTo({
            center: [e.lng, e.lat],
            zoom: 16,
            speed: 1.4,
            curve: 1.42,
            essential: true
        });
        if (!connectMode) {
            var openWhenSettled = function () {
                map.off('moveend', openWhenSettled);
                if (token !== flyToken) return;
                openEntryPopup(e);
            };
            map.on('moveend', openWhenSettled);
        }
        updateCounter();
    }

    function openEntryPopup(e) {
        if (openPopup) openPopup.remove();
        openPopup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: '260px',
            offset: 12
        })
            .setLngLat([e.lng, e.lat])
            .setHTML(e.popupHtml)
            .addTo(map);
    }

    function updateCounter() {
        var el = document.getElementById('entry-count');
        if (entries.length > 0) {
            el.textContent = (currentIndex + 1) + ' / ' + entries.length;
        }
    }

    function toggleConnectMode() {
        connectMode = !connectMode;
        btnConnect.classList.toggle('on', connectMode);
        if (openPopup) { openPopup.remove(); openPopup = null; }
        clearPendingHighlight();
        pendingFromId = null;
        if (connectMode) setBanner('Connect mode — click two markers');
        else setBanner('');
    }

    function clearPendingHighlight() {
        if (mapReady) map.setFilter('entries-highlight', ['==', ['get', 'id'], '__none__']);
    }

    function highlightPending(id) {
        map.setFilter('entries-highlight', ['==', ['get', 'id'], id]);
    }

    function onEntryClick(e) {
        var feature = e.features && e.features[0];
        if (!feature) return;
        var id = feature.properties.id;

        if (connectMode) {
            handleConnectClick(id);
            return;
        }

        var entry = entryById[id];
        if (entry) openEntryPopup(entry);
    }

    function onConnectionClick(e) {
        var feature = e.features && e.features[0];
        if (!feature) return;
        var id = feature.properties.id;
        var conn = connections.find(function (c) { return c.id === id; });
        if (!conn) return;

        if (openPopup) openPopup.remove();
        var popup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: '240px',
            className: 'connection-popup'
        })
            .setLngLat(e.lngLat)
            .setHTML(buildConnectionPopup(conn))
            .addTo(map);
        openPopup = popup;

        var node = popup.getElement();
        if (node) {
            var editBtn = node.querySelector('[data-act="edit"]');
            var delBtn = node.querySelector('[data-act="del"]');
            if (editBtn) editBtn.addEventListener('click', function () { editConnection(conn, popup); });
            if (delBtn)  delBtn.addEventListener('click',  function () { deleteConnection(conn, popup); });
        }
    }

    function handleConnectClick(entryId) {
        if (!pendingFromId) {
            pendingFromId = entryId;
            highlightPending(entryId);
            setBanner('Click a second marker to connect');
            return;
        }

        if (pendingFromId === entryId) {
            clearPendingHighlight();
            pendingFromId = null;
            setBanner('Connect mode — click two markers');
            return;
        }

        var fromId = pendingFromId;
        var toId = entryId;
        clearPendingHighlight();
        pendingFromId = null;

        var note = window.prompt('Note for this connection (optional):', '') || '';
        createConnection(fromId, toId, note);
        setBanner('Connect mode — click two markers');
    }

    async function createConnection(fromEntryId, toEntryId, note) {
        var ref = await db.collection('users').doc(currentUser.uid)
            .collection('connections').add({
                fromEntryId: fromEntryId,
                toEntryId: toEntryId,
                note: note || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        connections.push({
            id: ref.id,
            fromEntryId: fromEntryId,
            toEntryId: toEntryId,
            note: note || ''
        });
        refreshSources();
    }

    function buildConnectionPopup(conn) {
        var noteHtml = conn.note
            ? '<div class="popup-text">' + esc(conn.note) + '</div>'
            : '<div class="popup-loc">no note</div>';
        return noteHtml +
            '<div class="popup-actions">' +
                '<button data-act="edit">Edit</button>' +
                '<button data-act="del">Delete</button>' +
            '</div>';
    }

    async function editConnection(conn, popup) {
        var next = window.prompt('Edit note:', conn.note || '');
        if (next === null) return;
        await db.collection('users').doc(currentUser.uid)
            .collection('connections').doc(conn.id).update({ note: next });
        conn.note = next;
        var entry = connections.find(function (c) { return c.id === conn.id; });
        if (entry) entry.note = next;
        popup.setHTML(buildConnectionPopup(conn));
    }

    async function deleteConnection(conn, popup) {
        if (!window.confirm('Delete this connection?')) return;
        await db.collection('users').doc(currentUser.uid)
            .collection('connections').doc(conn.id).delete();
        connections = connections.filter(function (c) { return c.id !== conn.id; });
        popup.remove();
        if (openPopup === popup) openPopup = null;
        refreshSources();
    }

    async function loadEntries() {
        var snap = await db.collection('users').doc(currentUser.uid)
            .collection('entries').orderBy('createdAt', 'desc').get();

        snap.forEach(function (doc) {
            var d = doc.data();
            if (!d.location || d.location.latitude === null) return;

            var lat = d.location.latitude;
            var lng = d.location.longitude;

            var dateStr = '';
            if (d.createdAt) {
                var dt = d.createdAt.toDate();
                dateStr = dt.toLocaleString('en-GB', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
            }

            var locStr = lat.toFixed(4) + '°, ' + lng.toFixed(4) + '°';
            if (d.location.altitude !== null && d.location.altitude !== undefined) {
                locStr += ' | ALT ' + d.location.altitude.toFixed(1) + 'M';
            }

            var content = d.content || '';
            var preview = content.length > 200 ? content.slice(0, 200) + '...' : content;

            var popup = '<div class="popup-date">' + esc(dateStr) + '</div>';
            if (preview) popup += '<div class="popup-text">' + esc(preview) + '</div>';
            popup += renderAttachmentsHtml(d.attachments);
            popup += '<div class="popup-loc">' + esc(locStr) + '</div>';

            var record = {
                id: doc.id,
                lat: lat,
                lng: lng,
                popupHtml: popup,
                createdAt: d.createdAt ? d.createdAt.toDate() : null
            };
            entries.push(record);
            entryById[doc.id] = record;
        });

        refreshSources();

        var countEl = document.getElementById('entry-count');
        if (entries.length > 0) {
            countEl.textContent = entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies');
            currentIndex = 0;
            flyToEntry(0);
        } else {
            countEl.textContent = 'no entries with location — allow location access when posting';
        }
    }

    async function loadConnections() {
        var snap = await db.collection('users').doc(currentUser.uid)
            .collection('connections').get();
        snap.forEach(function (doc) {
            var d = doc.data();
            connections.push({
                id: doc.id,
                fromEntryId: d.fromEntryId,
                toEntryId: d.toEntryId,
                note: d.note || ''
            });
        });
        refreshSources();
    }

    async function chainVisible() {
        var visible = visibleEntries()
            .filter(function (e) { return e.createdAt; })
            .slice()
            .sort(function (a, b) { return a.createdAt - b.createdAt; });

        if (visible.length < 2) {
            alert('Need at least two visible entries with timestamps to chain.');
            return;
        }

        if (!window.confirm('Chain ' + visible.length + ' entries with ' + (visible.length - 1) + ' connections?')) return;

        for (var i = 0; i < visible.length - 1; i++) {
            await createConnection(visible[i].id, visible[i + 1].id, '');
        }
    }
})();
