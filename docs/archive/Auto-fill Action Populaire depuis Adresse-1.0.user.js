// ==UserScript==
// @name         Auto-fill Action Populaire depuis Adresse (Rennes / 35)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Pré-remplit le formulaire Action Populaire (verrouillé sur Rennes / Ille-et-Vilaine)
// @author       Vous
// @match        https://actionpopulaire.fr/evenements/creer/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION & CONSTANTS
    // ============================================
    const CONFIG = {
        FILL_DELAY: 800,
        PANEL_WIDTH: 340,
        API_NOMINATIM: 'https://nominatim.openstreetmap.org/search',
        API_BAN_SEARCH: 'https://api-adresse.data.gouv.fr/search/',
        API_BAN_REVERSE: 'https://api-adresse.data.gouv.fr/reverse/',
        BRAND_COLOR: '#571aff',
        // Biais géographique : Rennes & Ille-et-Vilaine (35)
        RENNES_LAT: 48.1173,
        RENNES_LON: -1.6778,
        // Bounding box de l'Ille-et-Vilaine (Ouest, Nord, Est, Sud)
        DEPT35_VIEWBOX: '-2.29,48.72,-1.01,47.63'
    };

    const TYPE_BUTTON_MAPPING = {
        '🥕 Marchés / Tractage': 'Diffusion de tracts',
        '🏫 Écoles': 'Diffusion de tracts',
        '🚪 Porte à portes': 'Porte-à-porte',
        '🖌️ Collages': 'Collage d\'affiches'
    };

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function setReactValue(element, value) {
        if (!element) return;
        const proto = element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        nativeSetter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function formatDate(date) {
        return ('0' + date.getDate()).slice(-2) + '/' +
               ('0' + (date.getMonth() + 1)).slice(-2) + '/' +
               date.getFullYear();
    }

    function formatTime(date) {
        return ('0' + date.getHours()).slice(-2) + ':' +
               ('0' + date.getMinutes()).slice(-2);
    }

    function findLabelInput(labelText) {
        const label = Array.from(document.querySelectorAll('label')).find(lbl =>
            lbl.textContent.includes(labelText)
        );
        return label ? label.querySelector('input') : null;
    }

    function findLabel(labelText) {
        return Array.from(document.querySelectorAll('label')).find(lbl =>
            lbl.textContent.includes(labelText)
        );
    }

    function fetchGM(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            resolve(JSON.parse(res.responseText));
                        } catch(e) { reject("Erreur de parsing JSON"); }
                    } else {
                        reject(`Erreur HTTP: ${res.status}`);
                    }
                },
                onerror: () => reject("Erreur réseau")
            });
        });
    }

    // ============================================
    // FIELD FILLING FUNCTIONS
    // ============================================
    function fillAddressFields(nomLieu, rue, codePostal, ville) {
        const inputAddress = document.querySelector('input[autocomplete="address-line1"]') || findLabelInput('Adresse du lieu');
        const inputZip = document.querySelector('input[autocomplete="postal-code"]') || findLabelInput('Code postal');
        const inputCity = document.querySelector('input[autocomplete="city"]') || findLabelInput('Commune');

        let inputLieuName = findLabelInput('Nom du lieu');
        if (!inputLieuName && inputAddress && inputAddress.parentElement.previousElementSibling) {
            inputLieuName = inputAddress.parentElement.previousElementSibling.querySelector('input');
        }

        if (inputLieuName && nomLieu) setReactValue(inputLieuName, nomLieu);
        if (inputAddress && rue) setReactValue(inputAddress, rue.trim());
        if (inputZip && codePostal) setReactValue(inputZip, codePostal);
        if (inputCity && ville) setReactValue(inputCity, ville);

        const countryInput = document.querySelector('input[name="country"]');
        if (countryInput) {
            setReactValue(countryInput, 'FR');
        }
        
        return { codePostal, ville };
    }

    function selectCustomDuration() {
        const durationSelects = Array.from(document.querySelectorAll('.css-b62m3t-container'));
        
        if (durationSelects.length >= 2) {
            const durationSelect = durationSelects[1];
            const durationButton = durationSelect.querySelector('.select__control');
            
            if (durationButton) {
                durationButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                
                setTimeout(() => {
                    const allDivs = Array.from(document.querySelectorAll('div'));
                    const customOption = allDivs.find(el =>
                        el.textContent === 'Personnalisée' &&
                        el.id &&
                        el.id.includes('option')
                    );
                    
                    if (customOption) {
                        customOption.click();
                    }
                }, 200);
            }
        }
    }

    function fillPriorityFields(eventData) {
        // [1/4] Event Title
        const allNameInputs = Array.from(document.querySelectorAll('input[name="name"]'));
        const titreInput = allNameInputs.find(input => {
            const label = input.closest('label');
            return label && (
                label.textContent.includes('Nom de l\'événement') ||
                label.textContent.includes('Nom de l\'emploi')
            );
        }) || allNameInputs[0];

        if (titreInput && eventData.title) {
            setReactValue(titreInput, eventData.title);
        }

        // [2/4] Location Name
        const lieuLabel = findLabel('Nom du lieu');
        if (lieuLabel && eventData.location) {
            const lieuInput = lieuLabel.querySelector('input');
            if (lieuInput && !lieuInput.value) {
                setReactValue(lieuInput, eventData.location);
            }
        }

        // [3/4] Date & Time (Start and End)
        if (eventData.start) {
            const startDate = new Date(eventData.start);
            const dateTimeInputs = Array.from(document.querySelectorAll('.rdt input[class="form-control"]'));
            
            if (dateTimeInputs.length >= 1) {
                setReactValue(dateTimeInputs[0], formatDate(startDate));
            }
            if (dateTimeInputs.length >= 2) {
                setReactValue(dateTimeInputs[1], formatTime(startDate));
            }

            if (eventData.end) {
                selectCustomDuration();
                setTimeout(() => {
                    const endDate = new Date(eventData.end);
                    const updatedDateTimeInputs = Array.from(document.querySelectorAll('.rdt input[class="form-control"]'));
                    if (updatedDateTimeInputs.length >= 3) {
                        setReactValue(updatedDateTimeInputs[2], formatDate(endDate));
                    }
                    if (updatedDateTimeInputs.length >= 4) {
                        setReactValue(updatedDateTimeInputs[3], formatTime(endDate));
                    }
                }, 300);
            }
        }

        // [4/4] Event Type
        if (eventData.calendar) {
            const buttonTitle = TYPE_BUTTON_MAPPING[eventData.calendar];
            if (buttonTitle) {
                const typeButton = document.querySelector(`button[color="choose"][title="${buttonTitle}"]`);
                if (typeButton) typeButton.click();
            }
        }
    }

    function fillSecondaryFields(eventData, addressAlreadyResolved = false) {
        const descriptionTextarea = document.querySelector('textarea');
        if (descriptionTextarea && eventData.description) {
            setReactValue(descriptionTextarea, eventData.description);
        }

        if (!addressAlreadyResolved) {
            const addressInput = findLabelInput('Adresse du lieu');
            if (addressInput && eventData.location) setReactValue(addressInput, eventData.location);

            const zipInput = findLabelInput('Code postal');
            if (zipInput && eventData.zipCode) setReactValue(zipInput, eventData.zipCode);

            const cityInput = findLabelInput('Commune');
            if (cityInput && eventData.city) setReactValue(cityInput, eventData.city);
        }

        const countryInput = document.querySelector('input[name="country"]');
        if (countryInput) setReactValue(countryInput, 'FR');

        const emailInput = findLabelInput('Adresse e-mail');
        if (emailInput && eventData.email) setReactValue(emailInput, eventData.email);

        const phoneInput = findLabelInput('Numéro de téléphone');
        if (phoneInput && eventData.phone) setReactValue(phoneInput, eventData.phone);

        const contactInput = findLabelInput('Nom de la personne à contacter');
        if (contactInput && eventData.contactName) setReactValue(contactInput, eventData.contactName);
    }

    function fillAllFields(eventData, addressAlreadyResolved = false) {
        setTimeout(() => {
            fillPriorityFields(eventData);
            fillSecondaryFields(eventData, addressAlreadyResolved);
        }, CONFIG.FILL_DELAY);
    }

    // ============================================
    // GEOCODING & AUTOCOMPLETE FUNCTIONS (VERROUILLÉ 35)
    // ============================================
    async function geocodeAndFill(query, status, eventData = {}) {
        if (!query) {
            status.innerText = "Pas de lieu à rechercher.";
            return;
        }

        status.innerText = "Recherche dans le 35...";
        status.style.color = "#777";
        let addressResolved = false;

        try {
            // Verrouillage strict sur l'Ille-et-Vilaine via viewbox + bounded=1 + countrycodes=fr
            const nominatimUrl = `${CONFIG.API_NOMINATIM}?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&countrycodes=fr&viewbox=${CONFIG.DEPT35_VIEWBOX}&bounded=1`;
            const nomData = await fetchGM(nominatimUrl);

            if (!nomData || nomData.length === 0) {
                status.style.color = "orange";
                status.innerText = "⚠ Lieu introuvable en Ille-et-Vilaine.";
            } else {
                const { lat, lon, address: fallbackAddr = {} } = nomData[0];
                status.innerText = "Traduction en adresse BAN...";

                try {
                    const banData = await fetchGM(`${CONFIG.API_BAN_REVERSE}?lon=${lon}&lat=${lat}`);
                    if (banData && banData.features && banData.features.length > 0) {
                        const props = banData.features[0].properties;
                        fillAddressFields(query, props.name, props.postcode, props.city);
                        addressResolved = true;
                    } else {
                        throw new Error('BAN: aucun résultat');
                    }
                } catch (banErr) {
                    const rue = (fallbackAddr.road || fallbackAddr.pedestrian || '') + ' ' + (fallbackAddr.house_number || '');
                    fillAddressFields(query, rue.trim(), fallbackAddr.postcode || '',
                        fallbackAddr.city || fallbackAddr.town || fallbackAddr.village || '');
                    addressResolved = true;
                }

                status.style.color = "green";
                status.innerHTML = `✓ <strong>Adresse (35) normalisée !</strong><br/>Champs du lieu mis à jour.`;
            }
        } catch (geoErr) {
            status.style.color = "orange";
            status.innerText = "⚠ Adresse non résolue.";
        }

        if (Object.keys(eventData).length > 0) {
            fillAllFields(eventData, addressResolved);
        }
    }

    /**
     * Recherche d'adresses via la BAN avec priorité géographique sur Rennes (35)
     * et filtrage sur le département 35
     */
    async function searchAddressSuggestions(query) {
        if (!query || query.length < 3) return [];
        try {
            // Priorité GPS sur Rennes (lat/lon) et filtrage sur les codes postaux en 35xxx
            const url = `${CONFIG.API_BAN_SEARCH}?q=${encodeURIComponent(query)}&lat=${CONFIG.RENNES_LAT}&lon=${CONFIG.RENNES_LON}&limit=10`;
            const data = await fetchGM(url);
            const features = data.features || [];

            // Ne garde en priorité que les adresses du département 35 (Ille-et-Vilaine)
            const dept35Features = features.filter(f => f.properties.postcode && f.properties.postcode.startsWith('35'));
            return (dept35Features.length > 0 ? dept35Features : features).slice(0, 5);
        } catch (e) {
            return [];
        }
    }

    // ============================================
    // UI PANEL MANAGEMENT
    // ============================================
    function createPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed; top: 80px; right: 20px; width: ${CONFIG.PANEL_WIDTH}px;
            background: white; border: 2px solid ${CONFIG.BRAND_COLOR}; border-radius: 8px;
            padding: 15px; z-index: 99999; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            font-family: Arial, sans-serif;
        `;
        panel.innerHTML = `
            <h3 style="margin:0 0 10px 0; font-size:15px; color:#000a2c; display:flex; justify-content:space-between; align-items:center;">
                <span>📍 Recherche d'adresse (Rennes / 35)</span>
            </h3>
            <div style="position: relative;">
                <input type="text" id="tm-search-query" autocomplete="off"
                       placeholder="Ex: Place de la Mairie, 12 rue..." 
                       style="width: 100%; padding: 8px 10px; margin-bottom: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 13px;">
                <ul id="tm-suggestions" style="
                    display: none; position: absolute; top: 36px; left: 0; right: 0;
                    background: white; border: 1px solid #ccc; border-radius: 4px;
                    list-style: none; margin: 0; padding: 0; max-height: 200px; overflow-y: auto;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.15); z-index: 100000;
                "></ul>
            </div>
            <button id="tm-search-btn" 
                    style="width: 100%; padding: 8px; background: ${CONFIG.BRAND_COLOR}; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">
                Rechercher un lieu dans le 35
            </button>
            <p id="tm-status" style="font-size: 12px; margin: 8px 0 0 0; color: #777; min-height: 16px;"></p>
        `;
        document.body.appendChild(panel);
        return panel;
    }

    function attachPanelEvents(searchInput, searchBtn, suggestionsList, status) {
        let debounceTimer;

        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const query = searchInput.value.trim();

            if (query.length < 3) {
                suggestionsList.style.display = 'none';
                return;
            }

            debounceTimer = setTimeout(async () => {
                const features = await searchAddressSuggestions(query);
                suggestionsList.innerHTML = '';

                if (features.length === 0) {
                    suggestionsList.style.display = 'none';
                    return;
                }

                features.forEach(feat => {
                    const props = feat.properties;
                    const li = document.createElement('li');
                    li.style.cssText = `
                        padding: 8px 10px; font-size: 12px; cursor: pointer;
                        border-bottom: 1px solid #eee; color: #222;
                    `;
                    li.innerHTML = `<strong>${props.name}</strong><br><span style="color:#666;">${props.postcode} ${props.city}</span>`;
                    
                    li.addEventListener('mouseenter', () => li.style.background = '#f0ecff');
                    li.addEventListener('mouseleave', () => li.style.background = 'white');

                    li.addEventListener('click', () => {
                        searchInput.value = props.label;
                        suggestionsList.style.display = 'none';

                        const existingName = findLabelInput('Nom du lieu')?.value;
                        const nomLieu = existingName || props.name;

                        fillAddressFields(nomLieu, props.name, props.postcode, props.city);
                        status.style.color = "green";
                        status.innerHTML = `✓ <strong>Adresse appliquée :</strong> ${props.label}`;
                    });

                    suggestionsList.appendChild(li);
                });

                suggestionsList.style.display = 'block';
            }, 250);
        });

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
                suggestionsList.style.display = 'none';
            }
        });

        searchBtn.addEventListener('click', () => {
            suggestionsList.style.display = 'none';
            geocodeAndFill(searchInput.value.trim(), status);
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                suggestionsList.style.display = 'none';
                geocodeAndFill(searchInput.value.trim(), status);
            }
        });
    }

    function initPanelWithAutoFill(searchInput, status) {
        const urlParams = new URLSearchParams(window.location.search);
        const eventData = {
            title: urlParams.get('ap_title'),
            location: urlParams.get('ap_location'),
            description: urlParams.get('ap_description'),
            start: urlParams.get('ap_start'),
            end: urlParams.get('ap_end'),
            calendar: urlParams.get('ap_calendar')
        };

        if (eventData.location) {
            searchInput.value = eventData.location;
            searchInput.closest('div').parentElement.style.borderColor = '#10b981';
            status.style.color = '#10b981';
            status.innerText = `📅 ${eventData.calendar || 'Événement'} détecté. Remplissage...`;
            geocodeAndFill(eventData.location, status, eventData);
        } else {
            status.innerText = "Verrouillé sur Rennes / Ille-et-Vilaine (35).";
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        createPanel();
        
        const searchInput = document.getElementById('tm-search-query');
        const searchBtn = document.getElementById('tm-search-btn');
        const suggestionsList = document.getElementById('tm-suggestions');
        const status = document.getElementById('tm-status');

        attachPanelEvents(searchInput, searchBtn, suggestionsList, status);
        initPanelWithAutoFill(searchInput, status);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();   