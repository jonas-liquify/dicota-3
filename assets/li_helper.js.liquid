var LiquifyHelper = {
    /**
     * Format a monetary value with the currency-format set in Shopify backend.
     * @param {number|string} value              Zahl oder String
     * @param {boolean=} isMinor                  true = Wert in Minor-Units (z. B. Cent), defaults to true
     * @param {string=} shopMoneyFormat           Format-String aus Shopify (z. B. "{{ amount }} €")
     */
    moneyFormat: function(value, isMinor, shopMoneyFormat) {
        if (typeof isMinor === 'undefined') { isMinor = true; }
        if (typeof shopMoneyFormat === 'undefined') { shopMoneyFormat = ''; }

        var floatValue = parseFloat(value);
        if (isNaN(floatValue)) { return ''; }
        var amount = isMinor ? floatValue / 100 : floatValue;

        var match = shopMoneyFormat.match(/\{\{\s*(\w+)\s*\}\}/);
        var formatType = match ? match[1] : null;

        var map = {
            amount:                               { dp: 2, dec: '.', grp: ',' },
            amount_no_decimals:                  { dp: 0, dec: '.', grp: ',' },
            amount_with_comma_separator:         { dp: 2, dec: ',', grp: '.' },
            amount_no_decimals_with_comma_separator: { dp: 0, dec: '.', grp: ',' },
            amount_with_apostrophe_separator:    { dp: 2, dec: "'", grp: '.' },
            amount_no_decimals_with_space_separator: { dp: 0, dec: ' ', grp: ' ' },
            amount_with_space_separator:          { dp: 2, dec: ' ', grp: ',' },
            amount_with_period_and_space_separator: { dp: 2, dec: ' ', grp: '.' }
        };

        if (map[formatType]) {
            var dp  = map[formatType].dp;
            var dec = map[formatType].dec;
            var grp = map[formatType].grp;
            var fixed = amount.toFixed(dp);
            var parts = fixed.split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, grp);
            var formatted = dp ? parts[0] + dec + parts[1] : parts[0];
            return shopMoneyFormat.replace(/\{\{\s*\w+\s*\}\}/, formatted);
        }

        var locale   = Shopify.locale + '-' + Shopify.country;
        var currency = Shopify.currency.active;
        return new Intl.NumberFormat(locale, {
            style:    'currency',
            currency: currency
        }).format(amount);
    },

    /**
     * Decodes HTML entities (e.g. &amp;lt;)
     */
    htmlspecialchars_decode: function(string) {
        var tempElement = document.createElement('textarea');
        tempElement.innerHTML = string;
        return tempElement.value;
    },

    /**
     * Simulate "Enter" key press on an element
     */
    triggerClick: function(el) {
        if (!(el instanceof HTMLElement)) {
            console.info(el + ' must be an instance of HTMLElement');
            return;
        }
        var ev = new KeyboardEvent('keydown', {
            code:      'Enter',
            key:       'Enter',
            charCode:  13,
            keyCode:   13,
            view:      window,
            bubbles:   true
        });
        el.dispatchEvent(ev);
    },

    /**
     * Trigger dropdown click to open mini-cart
     */
    handleTriggerClick: function() {
        var elements = document.querySelectorAll('[li-element="mini-cart-toggle"]');
        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            var closestDropdown = element.closest('.w-dropdown-toggle');
            if (closestDropdown) {
                this.triggerClick(closestDropdown);
            } else {
                console.error('(helper.js) No dropdown found for minicart trigger');
            }
        }
    },

    /**
     * Trigger click by element ID
     */
    triggerClickById: function(id) {
        var el = document.getElementById(id);
        this.triggerClick(el);
    },

    /**
     * Trigger click for all elements of a class
     */
    triggerClickByClass: function(className) {
        var elList = document.getElementsByClassName(className);
        for (var j = 0; j < elList.length; j++) {
            this.triggerClick(elList[j]);
        }
    },

    /**
     * Serialize form to object
     */
    serializeFormToObject: function(form) {
        var obj = {};
        try {
            var formData = new FormData(form);
            var properties = {};
            formData.forEach(function(value, key) {
                if (key.indexOf('properties') !== -1) {
                    var name = key.replace('properties[', '').replace(']', '');
                    properties[name] = value;
                    obj['properties'] = properties;
                } else {
                    obj[key] = value;
                }
            });
        } catch (e) {
            console.info('form not found', form);
        }
        return obj;
    }
};
