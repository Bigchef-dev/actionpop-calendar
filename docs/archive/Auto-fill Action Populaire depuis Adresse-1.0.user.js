// ==UserScript==
// @name         Auto-fill Action Populaire depuis Adresse
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Pré-remplit entièrement le formulaire d'événement Action Populaire depuis données d'agenda webCal
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
        FILL_DELAY: 800,  // Délai pour remplissage des champs (ms)
        PANEL_WIDTH: 320,
        API_NOMINATIM: 'https://nominatim.openstreetmap.org/search',
        API_BAN_REVERSE: 'https://api-adresse.data.gouv.fr/reverse/',
        BRAND_COLOR: '#571aff'
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
    /**
     * Force React to detect input/textarea value changes
     * Uses native prototype setter to bypass React's internal value tracker
     */
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

    /**
     * Set select element value and dispatch change event
     */
    function setSelectValue(selectElement, value) {
        if (!selectElement) return;
        selectElement.value = value;
        const event = new Event('change', { bubbles: true });
        selectElement.dispatchEvent(event);
    }

    /**
     * Format date to dd/mm/yyyy for rdt picker
     */
    function formatDate(date) {
        return ('0' + date.getDate()).slice(-2) + '/' +
               ('0' + (date.getMonth() + 1)).slice(-2) + '/' +
               date.getFullYear();
    }

    /**
     * Format time to hh:mm for rdt picker
     */
    function formatTime(date) {
        return ('0' + date.getHours()).slice(-2) + ':' +
               ('0' + date.getMinutes()).slice(-2);
    }

    /**
     * Find input element by associated label text
     */
    function findLabelInput(labelText) {
        const label = Array.from(document.querySelectorAll('label')).find(lbl =>
            lbl.textContent.includes(labelText)
        );
        return label ? label.querySelector('input') : null;
    }

    /**
     * Find label element by text content
     */
    function findLabel(labelText) {
        return Array.from(document.querySelectorAll('label')).find(lbl =>
            lbl.textContent.includes(labelText)
        );
    }

    /**
     * Promise wrapper around GM_xmlhttpRequest for use with async/await
     */
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
    /**
     * Fill address-related fields via autocomplete attributes
     */
    function fillAddressFields(nomLieu, rue, codePostal, ville) {
        const inputAddress = document.querySelector('input[autocomplete="address-line1"]');
        const inputZip = document.querySelector('input[autocomplete="postal-code"]');
        const inputCity = document.querySelector('input[autocomplete="city"]');

        let inputLieuName = null;
        if (inputAddress) {
            inputLieuName = inputAddress.parentElement.previousElementSibling.querySelector('input');
        }

        if (inputLieuName) setReactValue(inputLieuName, nomLieu);
        if (inputAddress) setReactValue(inputAddress, rue.trim());
        if (inputZip) setReactValue(inputZip, codePostal);
        if (inputCity) setReactValue(inputCity, ville);
        
        return { codePostal, ville };
    }

    /**
     * Select custom duration to enable end date/time fields
     */
    function selectCustomDuration() {
        // Find the duration dropdown and select "Personnalisée"
        // Look for the second select (first is organizer, second is duration)
        const durationSelects = Array.from(document.querySelectorAll('.css-b62m3t-container'));
        
        if (durationSelects.length >= 2) {
            const durationSelect = durationSelects[1];
            const durationButton = durationSelect.querySelector('.select__control');
            
            if (durationButton) {
                // Use mousedown to properly trigger react-select's open handler
                durationButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                
                // Wait for dropdown to render, then find option by id attribute
                setTimeout(() => {
                    const allDivs = Array.from(document.querySelectorAll('div'));
                    const customOption = allDivs.find(el =>
                        el.textContent === 'Personnalisée' &&
                        el.id &&
                        el.id.includes('option')
                    );
                    
                    if (customOption) {
                        customOption.click();
                        console.log('✓ Durée personnalisée sélectionnée');
                    } else {
                        console.warn("L'option 'Personnalisée' n'a pas été trouvée dans le menu.");
                    }
                }, 200);
            }
        }
    }

    /**
     * Fill the 4 priority fields: title, location, date/time, type
     */
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
            console.log('✓ [1/4] Titre de l\'événement rempli:', eventData.title);
        }

        // [2/4] Location Name
        const lieuLabel = findLabel('Nom du lieu');
        if (lieuLabel && eventData.location) {
            const lieuInput = lieuLabel.querySelector('input');
            if (lieuInput) {
                setReactValue(lieuInput, eventData.location);
                console.log('✓ [2/4] Nom du lieu rempli:', eventData.location);
            }
        }

        // [3/4] Date & Time (Start and End)
        if (eventData.start) {
            const startDate = new Date(eventData.start);
            const dateTimeInputs = Array.from(document.querySelectorAll('.rdt input[class="form-control"]'));
            
            // Fill start date
            if (dateTimeInputs.length >= 1) {
                const dateInput = dateTimeInputs[0];
                const dateStr = formatDate(startDate);
                setReactValue(dateInput, dateStr);
                dateInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('✓ [3/4] Date de début remplie:', dateStr);
            }
            
            // Fill start time
            if (dateTimeInputs.length >= 2) {
                const timeInput = dateTimeInputs[1];
                const timeStr = formatTime(startDate);
                setReactValue(timeInput, timeStr);
                timeInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('✓ [3/4] Heure de début remplie:', timeStr);
            }

            // Select custom duration to enable end date/time fields
            if (eventData.end) {
                selectCustomDuration();
                
                // Wait for duration selection and end fields to activate
                setTimeout(() => {
                    const endDate = new Date(eventData.end);
                    const updatedDateTimeInputs = Array.from(document.querySelectorAll('.rdt input[class="form-control"]'));
                    
                    // Fill end date
                    if (updatedDateTimeInputs.length >= 3) {
                        const endDateInput = updatedDateTimeInputs[2];
                        const endDateStr = formatDate(endDate);
                        setReactValue(endDateInput, endDateStr);
                        endDateInput.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log('✓ [3/4] Date de fin remplie:', endDateStr);
                    }
                    
                    // Fill end time
                    if (updatedDateTimeInputs.length >= 4) {
                        const endTimeInput = updatedDateTimeInputs[3];
                        const endTimeStr = formatTime(endDate);
                        setReactValue(endTimeInput, endTimeStr);
                        endTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log('✓ [3/4] Heure de fin remplie:', endTimeStr);
                    }
                }, 300);
            }
        }

        // [4/4] Event Type — click the matching button[color="choose"][title] directly
        if (eventData.calendar) {
            const buttonTitle = TYPE_BUTTON_MAPPING[eventData.calendar]
            
            if(!buttonTitle) {
                console.warn('Type d\'événement non reconnu pour le calendrier:', eventData.calendar);
                return;
            }

            const typeButton = document.querySelector(`button[color="choose"][title="${buttonTitle}"]`);
            if (typeButton) {
                typeButton.click();
                console.log('✓ [4/4] Type d\'événement sélectionné:', buttonTitle);
            } else {
                console.log('⚠ [4/4] Bouton type non trouvé pour:', buttonTitle);
            }
        }
    }

    /**
     * Fill secondary fields (description, address details, contact info)
     */
    function fillSecondaryFields(eventData) {
        // Description
        const descriptionTextarea = document.querySelector('textarea');
        if (descriptionTextarea && eventData.description) {
            setReactValue(descriptionTextarea, eventData.description);
            console.log('✓ Description remplie');
        }

        // Address details
        const addressLabel = findLabel('Adresse du lieu');
        if (addressLabel && eventData.location) {
            const addressInput = addressLabel.querySelector('input');
            if (addressInput) {
                setReactValue(addressInput, eventData.location);
                console.log('✓ Adresse du lieu remplie');
            }
        }

        // Postal code
        const zipInput = findLabelInput('Code postal');
        if (zipInput && eventData.zipCode) {
            setReactValue(zipInput, eventData.zipCode);
            console.log('✓ Code postal rempli');
        }

        // City
        const cityInput = findLabelInput('Commune');
        if (cityInput && eventData.city) {
            setReactValue(cityInput, eventData.city);
            console.log('✓ Commune remplie');
        }

        // Country
        const countryInput = document.querySelector('input[name="country"]');
        if (countryInput) {
            countryInput.value = 'FR';
            console.log('✓ Pays défini: FR');
        }

        // Email
        const emailInput = findLabelInput('Adresse e-mail');
        if (emailInput && eventData.email) {
            setReactValue(emailInput, eventData.email);
            console.log('✓ Email de contact rempli');
        }

        // Phone
        const phoneInput = findLabelInput('Numéro de téléphone');
        if (phoneInput && eventData.phone) {
            setReactValue(phoneInput, eventData.phone);
            console.log('✓ Téléphone de contact rempli');
        }

        // Contact name
        const contactInput = findLabelInput('Nom de la personne à contacter');
        if (contactInput && eventData.contactName) {
            setReactValue(contactInput, eventData.contactName);
            console.log('✓ Nom de contact rempli');
        }
    }

    /**
     * Orchestrate all form filling: priority fields first, then secondary
     */
    function fillAllFields(eventData) {
        setTimeout(() => {
            console.log('🔍 Remplissage des champs PRIORITAIRES en premier...', eventData);
            fillPriorityFields(eventData);
            console.log('✅ Champs prioritaires remplis. Remplissage des autres champs...');
            fillSecondaryFields(eventData);
            console.log('✅ Remplissage complet terminé');
        }, CONFIG.FILL_DELAY);
    }

    // ============================================
    // GEOCODING FUNCTION
    // ============================================
    /**
     * Géocode via Nominatim (supporte les POI type "Métro X"),
     * puis reverse-géocode via la BAN pour une adresse postale officielle.
     */
    async function geocodeAndFill(query, status, eventData = {}) {
        if (!query) {
            status.innerText = "Pas de lieu à rechercher.";
            return;
        }

        status.innerText = "Recherche GPS du lieu...";
        status.style.color = "#777";

        // Address resolution — failures must never block the rest of the form
        try {
            // Étape 1 : coordonnées GPS via Nominatim
            const nominatimUrl = `${CONFIG.API_NOMINATIM}?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1`;
            const nomData = await fetchGM(nominatimUrl);

            if (!nomData || nomData.length === 0) {
                status.style.color = "orange";
                status.innerText = "⚠ Lieu introuvable sur la carte. Adresse ignorée.";
            } else {
                const { lat, lon, address: fallbackAddr = {} } = nomData[0];
                status.innerText = "Traduction en adresse BAN...";

                // Étape 2 : adresse postale officielle via la BAN — wrapped so BAN failure uses Nominatim fallback
                try {
                    const banData = await fetchGM(`${CONFIG.API_BAN_REVERSE}?lon=${lon}&lat=${lat}`);

                    if (banData && banData.features && banData.features.length > 0) {
                        const props = banData.features[0].properties;
                        fillAddressFields(query, props.name, props.postcode, props.city);
                        console.log('📍 Adresse BAN trouvée:', props.name, props.postcode, props.city);
                    } else {
                        throw new Error('BAN: aucun résultat');
                    }
                } catch (banErr) {
                    const rue = (fallbackAddr.road || fallbackAddr.pedestrian || '') + ' ' + (fallbackAddr.house_number || '');
                    fillAddressFields(query, rue.trim(), fallbackAddr.postcode || '',
                        fallbackAddr.city || fallbackAddr.town || fallbackAddr.village || '');
                    console.warn('⚠ Échec BAN, utilisation du fallback Nominatim:', banErr.message);
                }

                status.style.color = "green";
                status.innerHTML = `✓ <strong>Adresse normalisée !</strong><br/>Formulaire pré-rempli. Vérifiez et soumettez.`;
            }
        } catch (geoErr) {
            status.style.color = "orange";
            status.innerText = "⚠ Adresse non résolue. Remplissage des autres champs...";
            console.error('Erreur géocodage:', geoErr);
        }

        // Always fill the rest of the form regardless of address resolution outcome
        if (Object.keys(eventData).length > 0) {
            fillAllFields(eventData);
        }
    }

    // ============================================
    // UI PANEL MANAGEMENT
    // ============================================
    /**
     * Create and inject the control panel
     */
    function createPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed; top: 80px; right: 20px; width: ${CONFIG.PANEL_WIDTH}px;
            background: white; border: 2px solid ${CONFIG.BRAND_COLOR}; border-radius: 8px;
            padding: 15px; z-index: 99999; box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            font-family: Arial, sans-serif;
        `;
        panel.innerHTML = `
            <h3 style="margin-top:0; font-size:16px; color:#000a2c;">📍 Recherche de lieu</h3>
            <input type="text" id="tm-search-query" placeholder="Ex: Mairie de Rennes" 
                   style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
            <button id="tm-search-btn" 
                    style="width: 100%; padding: 8px; background: ${CONFIG.BRAND_COLOR}; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                Chercher & Remplir
            </button>
            <p id="tm-status" style="font-size: 12px; margin-top: 10px; color: #777; min-height: 20px;"></p>
        `;
        document.body.appendChild(panel);
        return panel;
    }

    /**
     * Attach event listeners to panel controls
     */
    function attachPanelEvents(searchInput, searchBtn, status) {
        // Search button click
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            geocodeAndFill(query, status);
        });

        // Enter key in search input
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                geocodeAndFill(query, status);
            }
        });
    }

    /**
     * Initialize panel with URL parameters or show default message
     */
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

        // Auto-fill if parameters present
        if (eventData.location) {
            searchInput.value = eventData.location;
            searchInput.parentElement.parentElement.style.borderColor = '#10b981';
            status.style.color = '#10b981';
            status.innerText = `📅 ${eventData.calendar || 'Événement'} détecté. Remplissage automatique...`;
            geocodeAndFill(eventData.location, status, eventData);
        } else {
            status.innerText = "Cliquez sur un événement pour auto-remplir";
        }

        // Clean URL if parameters were used
        // if (eventData.location) {
            // window.history.replaceState({}, document.title, window.location.pathname);
        // }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        // Create and inject panel
        createPanel();
        
        // Get panel elements
        const searchInput = document.getElementById('tm-search-query');
        const searchBtn = document.getElementById('tm-search-btn');
        const status = document.getElementById('tm-status');

        // Attach event listeners
        attachPanelEvents(searchInput, searchBtn, status);

        // Initialize with URL parameters or show default message
        initPanelWithAutoFill(searchInput, status);
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();