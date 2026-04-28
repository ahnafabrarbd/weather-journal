(function () {
    'use strict';

    var currentUser = null;
    var map = null;

    requireAuth(function (user) {
        currentUser = user;
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        initMap();
        loadEntries();
    });

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function initMap() {
        // Dhaka center
        map = L.map('map', {
            center: [23.8103, 90.4125],
            zoom: 12,
            zoomControl: false,
            attributionControl: false
        });

        // CartoDB light_nolabels tiles — the CSS filter on .leaflet-tile-pane
        // turns this into white outlines on black
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(map);
    }

    async function loadEntries() {
        var snap = await db.collection('users').doc(currentUser.uid)
            .collection('entries').orderBy('createdAt', 'desc').get();

        var count = 0;

        snap.forEach(function (doc) {
            var d = doc.data();
            if (!d.location || d.location.latitude === null) return;

            var lat = d.location.latitude;
            var lng = d.location.longitude;

            // Date
            var dateStr = '';
            if (d.createdAt) {
                var dt = d.createdAt.toDate();
                dateStr = dt.toLocaleString('en-GB', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
            }

            // Location string
            var locStr = lat.toFixed(4) + '\u00B0, ' + lng.toFixed(4) + '\u00B0';
            if (d.location.altitude !== null && d.location.altitude !== undefined) {
                locStr += ' | ALT ' + d.location.altitude.toFixed(1) + 'M';
            }

            // Content preview
            var content = d.content || '';
            var preview = content.length > 200 ? content.slice(0, 200) + '...' : content;

            // Popup HTML
            var popup = '<div class="popup-date">' + esc(dateStr) + '</div>' +
                '<div class="popup-text">' + esc(preview) + '</div>' +
                '<div class="popup-loc">' + esc(locStr) + '</div>';

            // White circle marker
            L.circleMarker([lat, lng], {
                radius: 5,
                color: '#fff',
                fillColor: '#fff',
                fillOpacity: 0.9,
                weight: 1
            }).addTo(map).bindPopup(popup, {
                maxWidth: 250,
                minWidth: 150
            });

            count++;
        });

        var countEl = document.getElementById('entry-count');
        if (count > 0) {
            countEl.textContent = count + ' entr' + (count === 1 ? 'y' : 'ies') + ' on map';
        } else {
            countEl.textContent = 'no entries with location data';
        }
    }
})();
