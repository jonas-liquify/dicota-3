document.addEventListener('alpine:init', () => {
    Alpine.data('handleVariant', (pProduct = null, optionsByName = null, selectedOrFirstAvailable = null) => ({
        /**
         * The current product object.
         */
        selectedVariant : selectedOrFirstAvailable?.id,
        product: {
            ...pProduct,
            options_by_name: optionsByName,
            initial_selected_or_first_available_variant: selectedOrFirstAvailable,
            selected_or_first_available_variant: {
                ...selectedOrFirstAvailable,
                featured_image: selectedOrFirstAvailable?.featured_image?.src,
                quantity: 1,
                addToCartButton: true,
                _price: selectedOrFirstAvailable?.price ?? 0,
                set price(value) {
                    if (isNaN(value)) {
                        throw new Error('Liquify - Price must be a number');
                    }
                    this._price = value;
                },
                get price() {
                    return this._price;
                },
            },

        },

        /**
         * helper properties
         */
        firstOptionHasAvailableChildren: {},
        selectorType: 'radio',
        formSelector: "#product_form_" + (pProduct?.id ? pProduct.id : selectedOrFirstAvailable?.id),
        isProductPage: window.location.pathname.includes('/products/'),
        filter: {},

        // Use init for debugging
        init() {

        },

        qs(selector) {
            return document.querySelector(selector)
        },

        /**
         * @wip: returns an object with the available variants based on the current filter-selection.
         *   result.existingOptions contains the list of options based on the given filter.
         */
        get variantsBasedOnFilter() {
            let result = {
                availableVariants: [],
            };

            // If no filter is set, return all variants
            if (Object.keys(this.filter).length === 0) {
                result.availableVariants = this.product?.variants;
            } else {
                // Filter variants based on current filter
                result.availableVariants = this.product?.variants.filter(variant => {
                    // Define, how many filters should match
                    // let filter = this.getFirstTwoSelectedFilters()
                    let filter = this.filter

                    return Object.entries(filter).every(([filterName, filterValue]) => {
                        console.log("filterValue", filterValue, this.getFirstTwoSelectedFilters())
                        const matchingOption = Object.entries(variant).find(([key, value]) =>
                            key.startsWith('option') && value === filterValue
                        );
                        return matchingOption !== undefined;
                    });
                });
            }

            result.existingOptions = this.getExistingOptions(result.availableVariants);

            // console.log("Liquify - return of variantsBasedOnFilter", result)

            return result;
        },

        getFirstTwoSelectedFilters() {
            return Object.entries(this.filter).slice(0, 2).reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {});
        },

        getExistingOptions(variants) {
            let uniqueOptions = {
                option1: [...new Set(variants?.map(item => item.option1))],
                option2: [...new Set(variants?.map(item => item.option2))],
                option3: [...new Set(variants?.map(item => item.option3))],
            }

            let optionsByName = {}
            Object.assign(optionsByName, this.product.options_by_name);

            let optionNames = this.optionNames(optionsByName);

            let result = {}
            Object.keys(optionNames).forEach(optionName => {
                let optionValues = Object.values(optionNames[optionName]);
                // map the actual option name to the unique options
                Object.values(uniqueOptions).forEach(value => {
                    if (value.length > 0 && optionValues.includes(value[0])) {
                        result[optionName] = value;
                    }
                });
            });

            return result
        },

        optionNames(data) {
            const result = {};

            Object.keys(data).forEach(optionName => {
                result[optionName] = data[optionName].option.values;
            });

            return result;
        },

        observeVariants() {
            if(this.isProductPage) {
                // todo: maybe via $dispatch or helper?!
                let $this = this

                window.onpopstate = function(event) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const variantId = urlParams.get('variant');
                    const observer = new MutationObserver(mutationCallback);

                    //fixme: maybe in helper?!
                    function mutationCallback(mutations) {
                        mutations.forEach(function(mutation) {
                            if (mutation.type === "attributes" && (mutation.attributeName === "checked" || mutation.attributeName === "selected")) {
                                // fixme: kann/muss theoretisch weg, da über :class gelöst werden muss
                                mutation.target.previousElementSibling.classList.remove('w--redirected-checked', 'w--redirected-focus')
                                if(mutation?.target?.checked || mutation?.target?.selected) {
                                    mutation.target.previousElementSibling.classList.add('w--redirected-checked', 'w--redirected-focus')
                                    $this.setVariant(false)
                                }
                            }
                        })
                        observer.disconnect()
                    }

                    selectedOrFirstAvailable = $this?.product.variants.filter(variant => parseInt(variant.id) === parseInt(variantId))[0]

                    $this.product.selected_or_first_available_variant = {...$this.product.selected_or_first_available_variant, ...selectedOrFirstAvailable};

                    $this.product.options.forEach(function (option) {
                        let selector = " [data-productVariantsLoop] input[name='" + option + "']"
                        if($this.selectorType === 'select') {
                            selector = " [data-productVariantsLoop] select[name='" + option + "'] option"
                        }
                        document.querySelectorAll($this.formSelector + selector).values().forEach(function(element) {
                            observer.observe(element, {
                                attributes: true
                            });
                        })
                    })
                }
            }
        },

        updateVariantStatuses() {
            console.log("Liquify - updateVariantStatuses")

            // Innerhalb von $nextTick(() => { activateVariants() }) bezieht sich this.$el auf den Container des Alpine-Objekts.
            // Bei einer Variantenauswahl hingegen verweist this.$el auf das Element, das die Auswahl ausgelöst hat.
            let form = this.$el.closest('form') ?? this.$el.querySelector('form');
            const selectedOptionOneVariants = this.product.variants.filter((variant) => {
                    let element = form?.querySelector('[data-productVariantsLoop] input[type="radio"]:checked');
                    if (this.selectorType === 'select') {
                        element = form?.querySelector('[data-productVariantsLoop] select')
                    }
                    return element?.value === variant.option1
                }
            );



            let inputWrappers = null;
            if(form?.querySelectorAll('[data-ProductVariantsLoop]')) {
                inputWrappers = [...form.querySelectorAll('[data-ProductVariantsLoop]')]
            }

            inputWrappers?.forEach((option, index) => {
                if (index === 0) return;

                let optionInputs = [...option.querySelectorAll('input[type="radio"]')];

                if (this.selectorType === 'select') {
                    optionInputs = [...option.querySelectorAll('option')];
                }


                let previousOptionSelected = inputWrappers[index - 1].querySelector(':checked')
                if (previousOptionSelected?.getAttribute('data-disabled') !== null) {
                    previousOptionSelected = inputWrappers[index - 1].querySelector('input:not([data-disabled]), option:not([data-disabled])')
                }
                previousOptionSelected = previousOptionSelected.value
                if (!previousOptionSelected) {
                    return;
                }

                const availableOptionInputsValue = selectedOptionOneVariants
                    .filter((variant) => variant.available && variant[`option${index}`] === previousOptionSelected)
                    .map((variantOption) => variantOption[`option${index + 1}`]);

                this.setInputAvailability(optionInputs, availableOptionInputsValue);

                // Select the next available option
                if (this.selectorType === 'select') {
                    selectedVal = option.querySelector('select').value;
                    for (let i = 0; i < option.querySelector('select').options.length; i++) {
                        // Select the next available option if not in available options
                        if(availableOptionInputsValue.indexOf(selectedVal) === -1
                            && option.querySelector('select').options[i].text === availableOptionInputsValue[0]
                        ) {
                            option.querySelector('select').selectedIndex = i;
                            break;
                        }
                    }
                }
            });
        },

        setInputAvailability(listOfOptions, listOfAvailableOptions) {
            listOfOptions.forEach((input) => {
                if (listOfAvailableOptions.includes(input.getAttribute('value'))) {
                    input.classList.remove('data-disabled');
                    input.removeAttribute('data-disabled');
                    if (this.selectorType === 'select') {
                        input.removeAttribute("disabled");
                    }
                } else {
                    input.classList.add('data-disabled');
                    input.setAttribute('data-disabled', '');
                    if (this.selectorType === 'select') {
                        input.setAttribute("disabled", "true");
                    }
                }
            });

        },

        /**
         * Called by x-init.
         *
         * @see ProductVariationsContainer
         */
        activateVariants() {
            if(this.$el.querySelectorAll('[li-element="product-option-select"]').length > 0) {
                this.selectorType = 'select'
            }
            const checkboxes = this.$el.querySelectorAll("[li-element=product-option-input]");
            checkboxes.forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    this.parentNode.parentNode.querySelectorAll("[li-element=product-option-input]").forEach(element => {
                        element.previousElementSibling.classList.remove('w--redirected-checked', 'w--redirected-focus')
                    })

                    if (this.checked) {
                        this.previousElementSibling.classList.add('w--redirected-checked', 'w--redirected-focus')
                    }
                });
            });
            this.observeVariants();


            this.product.variants.map((variant) => {
                if (this.firstOptionHasAvailableChildren[variant?.option1] === undefined) {
                    this.firstOptionHasAvailableChildren[variant?.option1] = 0;
                }
                this.firstOptionHasAvailableChildren[variant?.option1] += variant?.available;
            });

            let option1 = this.product.options.length > 0
                ? this.getVariantElement(this.product.options?.[0])
                : false;

            let option2 = this.product.options.length > 1
                ? this.getVariantElement(this.product.options?.[1])
                : false;

            let option3 = this.product.options.length > 2
                ? this.getVariantElement(this.product.options?.[2])
                : false;

            if (option1) {
                this.activateVariant(option1)
            }
            if (option2) {
                this.activateVariant(option2)
            }
            if (option3) {
                this.activateVariant(option3)
            }
            this.updateVariantStatuses()

            // @todo: Replace with CSS
            const css = ' [data-ProductVariantsLoop] input[type=radio].data-disabled + span{ ' +
                ' text-decoration: line-through; ' +
                ' opacity: .5; ' +
                ' } ' +
                ' .button.max-width-full.w-button:data-disabled, ' +
                ' .button.max-width-full.w-button[data-disabled] { ' +
                '  cursor: not-allowed; ' +
                ' }';
            const style = document.createElement("style")
            const head = document.getElementsByTagName('head')[0]
            head.appendChild(style)
            style.appendChild(document.createTextNode(css));
        },

        activateVariant(element) {
            element.parentNode.parentNode.querySelectorAll("[li-element=product-option-input]").forEach(element => {
                element.previousElementSibling.classList.remove('w--redirected-checked', 'w--redirected-focus')
            })
            element.previousElementSibling.classList.add('w--redirected-checked')
        },

        /**
         * Retrieves the selected element from the transferred option group
         */
        getVariantElement(optionName) {
            // Innerhalb von $nextTick(() => { activateVariants() }) bezieht sich this.$el auf den Container des Alpine-Objekts.
            // Bei einer Variantenauswahl hingegen verweist this.$el auf das Element, das die Auswahl ausgelöst hat.
            let form = this.$el.closest('form') ?? this.$el.querySelector('form');

            let element = form?.querySelector("[data-productVariantsLoop] input[name='" + optionName + "']:checked");
            if (element && element?.getAttribute('data-disabled') !== null) {
                element = form.querySelector("[data-productVariantsLoop] input[name='" + optionName + "']:not([data-disabled])")
            }
            //let selector = this.formSelector + " [data-productVariantsLoop] input[name='" + optionName + "']:checked";

            if (optionName !== undefined && this.selectorType === 'select') {
                element = form?.querySelector("[data-productVariantsLoop] select[name='" + optionName + "'] option:checked")

                if (element && element?.getAttribute('data-disabled') !== null) {
                    element = form.querySelector("[data-productVariantsLoop] select[name='" + optionName + "'] option:not([data-disabled])")
                }
            }
            return element ?? '';
        },

        filterVariants() {
            const option1 = this.product.options.length > 0
                ? this.getVariantElement(this.product.options?.[0])
                : false;

            const option2 = this.product.options.length > 1
                ? this.getVariantElement(this.product.options?.[1])
                : false;

            const option3 = this.product.options.length > 2
                ? this.getVariantElement(this.product.options?.[2])
                : false;

            if (option1) {
                this.activateVariant(option1)
            }
            if (option2) {
                this.activateVariant(option2)
            }
            if (option3) {
                this.activateVariant(option3)
            }

            let selectedOptions = [
                option1?.value,
                option2?.value,
                option3?.value,
            ];
            selectedOptions = (selectedOptions.filter(i => i)).join('-')

            let possibleProducts = []
            for (const variant of this.product.variants) {
                let variantString = [
                    option1?.value ? variant?.option1 : undefined,
                    option2?.value ? variant?.option2 : undefined,
                    option3?.value ? variant?.option3 : undefined,
                ];
                variantString = (variantString.filter(i => i)).join('-')

                if (selectedOptions === variantString) {
                    possibleProducts.push(variant)
                }
            }

            return possibleProducts;
        },

        setUrlParam() {
            const urlParams = new URLSearchParams(window.location.search);
            urlParams.set('variant', this.product.selected_or_first_available_variant.id);

            window.history.pushState({ ...window.history.state}, '', '?' + urlParams.toString());
        },

        findAvailableVariant() {
            const matchedProducts = this.filterVariants()

            if (matchedProducts.length < 1) {
                console.info('Liquify - No next best option found, using initial first available variant')
                return this.product.initial_selected_or_first_available_variant
            }

            return matchedProducts[0]
        },

        setVariant(pushState = true) {
            this.updateVariantStatuses()
            const product = this.findAvailableVariant()

            if (! product) {
                console.log('Liquify - No product found to set active')

                return
            }

            console.log('Liquify - Set active variant', product)

            this.product.selected_or_first_available_variant.addToCartButton = true

            this.product.selected_or_first_available_variant = {...this.product.selected_or_first_available_variant, ...product};
            this.product.selected_or_first_available_variant.featured_image = product?.featured_image?.src
            this.product.selected_or_first_available_variant.price = product?.price;

            // nur für die Detailseiten
            if (pushState && this.isProductPage) {
                this.setUrlParam()
            }
        },

        getAddToCartBody(products) {
            return JSON.stringify({
                'items': products.map(product => ({
                    id: product.id,
                    quantity: product.quantity ?? 1,
                }))
            });
        },

        callAddToCartApi(body) {
            return fetch(window.Shopify.routes.root + 'cart/add.js', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: body
            })
        },

        /**
         * Add all products to cart.
         */
        async addToCartWithBundle(toggleMiniCart = true) {
            console.log('Liquify - addToCartWithBundle()', toggleMiniCart);

            // Map all bundle products
            const products = Object.entries(this.bundle).map(([key, value]) => ({
                id: value,
                quantity: 1
            }))

            // Add selected product
            products.push({
                id: this.product.selected_or_first_available_variant.id ?? this.product.selected_or_first_available_variant?.id,
                quantity: this.product.selected_or_first_available_variant.quantity ?? 1,
            })

            // Create body with all products
            let body = this.getAddToCartBody(products);

            // Single API call for all products
            try {
                let response = await this.callAddToCartApi(body);
                let data = await response.json();
                console.log('Liquify - Items added (addToCartWithBundle()):', data.items);
                this.products = data.items;

                LiquifyHelper.handleTriggerClick();

                this.$dispatch('cartupdated');
                if (toggleMiniCart) {
                    this.$dispatch('toggleminicart');
                }
                this.$dispatch('showcartmessage', {
                    status: data.status,
                    message: data.message,
                    description: data.description
                });
            } catch (error) {
                console.error('Liquify - Error in add to cart with bundle:', error);
                this.$dispatch('showcartmessage', {
                    status: error.status,
                    message: error.message,
                    description: error.description
                });
            }
        },

        /**
         * Add a single product to cart.
         */
        async addToCart(e, toggleMiniCart = true, productId = undefined, quantity = undefined) {
            if (!e || !(e instanceof Event) || typeof e.preventDefault !== 'function') {
                e = window.event
            }
            e.preventDefault();
            console.log('Liquify - Add to cart called, selected_or_first_available_variant.id:', this.product.selected_or_first_available_variant?.id);

            if (!this.product.selected_or_first_available_variant?.available) {
                return
            }

            // Innerhalb von $nextTick(() => { activateVariants() }) bezieht sich this.$el auf den Container des Alpine-Objekts.
            // Bei einer Variantenauswahl hingegen verweist this.$el auf das Element, das die Auswahl ausgelöst hat.
            let form = this.$el.closest('form') ?? this.$el.querySelector('form');
            const formData = LiquifyHelper.serializeFormToObject(form);
            const payload = {
                "items" : [{
                    id: productId ?? this.product.selected_or_first_available_variant?.id,
                    quantity: quantity ?? this.quantity ?? 1,
                    ...formData
                }]
            };

            let body = JSON.stringify(payload);

            await fetch(window.Shopify.routes.root + 'cart/add.js', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: body
            })
                .then(response => response.json())
                .then(data => {
                    this.products = data.items;

                    console.log('Liquify - product(s) added');
                    this.$dispatch('cartupdated', this.products);

                    if (toggleMiniCart) {
                        this.$dispatch('toggleminicart');
                    }

                    this.$dispatch('showcartmessage', { status: data.status, message: data.message, description: data.description });
                })
                .catch((error) => {
                    console.error('Liquify - addToCart error:', error);
                    this.$dispatch('showcartmessage', { status: error.status, message: error.message, description: error.description });
                });
        },

        /**
         * Add a single product to cart and redirect to checkout.
         */
        async addToCartAndCheckout(e, toggleMiniCart = true, productId = undefined, quantity = undefined) {
            await this.addToCart(e, toggleMiniCart, productId, quantity)
                .then(() => {
                    window.location.href = '/checkout';
                });
        },

        /**
         * Format monetary values.
         */
        moneyFormat(value, minor = true) {
            return LiquifyHelper.moneyFormat(value, minor)
        },

        /**
         * @deprecated
         */
        get options_by_name() {
            //console.warn('deprecated "get options_by_name" in handleVariant')
            return this.product.options_by_name
        },
        /**
         * @deprecated
         */
        get options() {
            //console.warn('deprecated "get options" in handleVariant')
            return this.product.options
        },
        /**
         * @deprecated
         */
        get variants() {
            //console.warn('deprecated "get variants" in handleVariant')
            return this.product.variants
        },
        /**
         * @deprecated
         */
        get initial_selected_or_first_available_variant() {
            //console.warn('deprecated "get initial_selected_or_first_available_variant" in handleVariant')
            return this.product.initial_selected_or_first_available_variant
        },
        /**
         * @deprecated
         */
        get selected_or_first_available_variant() {
            //console.warn('deprecated "get selected_or_first_available_variant" in handleVariant')
            return this.product.selected_or_first_available_variant
        },
        /**
         * @deprecated
         */
        get variantImage() {
            //console.warn('deprecated "get variantImage" in handleVariant')
            return this.product.selected_or_first_available_variant.featured_image
        },
        /**
         * @deprecated
         */
        get selected_product_id() {
            //console.warn('deprecated "get options" in handleVariant')
            return this.product.selected_or_first_available_variant.id
        },
        /**
         * @deprecated
         */
        get quantity() {
            //console.warn('deprecated "get quantity" in handleVariant')
            return this.product.selected_or_first_available_variant.quantity
        },
        /**
         * @deprecated
         */
        set quantity(quantity) {
            this.product.selected_or_first_available_variant.quantity = quantity
        },
        /**
         * @deprecated
         */
        get addToCartButton() {
            //console.warn('deprecated "get addToCartButton" in handleVariant')
            return this.product.selected_or_first_available_variant.addToCartButton
        },
        /**
         * @deprecated
         */
        set price(value) {
            //console.warn('deprecated "set price" in handleVariant')
            this.product.selected_or_first_available_variant.price = value;
        },
        /**
         * @deprecated
         */
        get price() {
            //console.warn('deprecated "get price" in handleVariant')
            return this.product.selected_or_first_available_variant.price;
        },
    }));

    /**
     * Alpine-Store for Global Bundle.
     */
    Alpine.data('handleGlobalBundle', (useQuantity = true, shopMoneyFormat) => ({
        bundle: {
            items: [],
            title: '',
            index: 1,
            /**
             * Returns the total price of all products in the globalBundle.
             */
            get total() {
                return this.items.reduce((acc, item) => {
                    return acc + (item.product.price * item.quantity);
                }, 0);
            },
            get totalFormatted() {
                return LiquifyHelper.moneyFormat(this.total, true, shopMoneyFormat);
            }
        },



        init() {
            this.loadGlobalBundle();
            this.loadBundleIndex();
        },
        handleAdd(event) {
            this.addToGlobalBundle(event.detail.variant, event.detail.product)
        },
        getGlobalBundleCartBody() {
            let globalBundle = this.getGlobalBundleFromLocalStorage();

            return JSON.stringify({
                'items': globalBundle.map(item => ({
                    id: item.variant.id,
                    quantity: item.quantity,
                    properties: {
                        'bundle': `${this.bundle.title} ${this.bundle.index}`,
                    }
                }))
            })
        },
        /**
         * @todo Refactoring: Duplication in handleVariant() store.
         */
        callAddToCartApi(body) {
            return fetch(window.Shopify.routes.root + 'cart/add.js', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: body
            })
        },

        async addGlobalBundleToCart() {
            const body = this.getGlobalBundleCartBody()

            await this.callAddToCartApi(body)
                .then(response => {
                    let data = response.json();

                    this.updateBundleIndex();
                    this.clearGlobalBundle();
                    LiquifyHelper.handleTriggerClick();

                    this.$dispatch('cartupdated');
                    this.$dispatch('toggleminicart');
                    this.$dispatch('showcartmessage', {
                        status: data.status,
                        message: data.message,
                        description: data.description
                    });
                });
        },

        clearGlobalBundle() {
            this.updateBundleObject([]);
        },

        /**
         * Adds a new product to the globalBundle.
         *
         * If quantities are enabled and the product is already in the bundle, increase the quantity by 1.
         */
        addToGlobalBundle(variant, product) {
            if (useQuantity) {
                this.addOrIncreaseGlobalBundleItem(
                    this.getNewGlobalBundleItem(variant, product, variant.quantity)
                );

                return;
            }

            // Add the product as a new item to the bundle.
            this.addNewGlobalBundleItem(
                this.getNewGlobalBundleItem(variant, product, variant.quantity)
            );
        },

        getNewGlobalBundleItem(variant, product, quantity = 1) {
            variant.quantity = quantity

            return {
                id: this.uniqueId(),
                variant: variant,
                quantity: variant.quantity,
                product: product
            }
        },

        /**
         * If the product is already in the bundle, increase the quantity by 1.
         */
        addOrIncreaseGlobalBundleItem(item) {
            let globalBundle = this.getGlobalBundleFromLocalStorage();
            let existingItem = globalBundle.find(bundleItem => bundleItem.variant.id === item.variant.id);

            if (existingItem) {
                let quantity = parseInt(existingItem.variant.quantity);
                quantity += item.variant.quantity;
                existingItem.quantity = quantity;
                existingItem.variant.quantity = quantity;
            } else {
                globalBundle.push(item);
            }

            this.updateBundleObject(globalBundle);
        },

        addNewGlobalBundleItem(item) {
            let globalBundle = this.getGlobalBundleFromLocalStorage();
            globalBundle.push(item);

            this.updateBundleObject(globalBundle);
        },

        /**
         * Update the Alpine globalBundle object and save it to local storage.
         */
        updateBundleObject(globalBundle) {
            this.bundle.items = globalBundle;
            localStorage.setItem('globalBundle', JSON.stringify(globalBundle));
        },

        /**
         * One method to handle the various ways to update a bundle item.
         *
         * @see ProductVariationsContainer
         */
        updateBundleItem(bundleItemId, quantity) {
            this.loadGlobalBundle();

            if (quantity === 0) {
                this.removeProductFromGlobalBundle(bundleItemId);
                return;
            }

            if (quantity === '-1') {
                this.decrementQuantityOfBundleItem(bundleItemId);
                return;
            }

            if (quantity === '+1') {
                this.incrementQuantityOfBundleItem(bundleItemId);
                return;
            }

            this.updateQuantityOfBundleItem(bundleItemId, quantity);
        },

        updateQuantityOfBundleItem(bundleItemId, quantity) {
            let bundle = this.getGlobalBundleFromLocalStorage();
            let bundleItem = bundle.find(bundleItem => bundleItem.id === bundleItemId);
            bundleItem.quantity = quantity;
            bundleItem.product.quantity = quantity;

            this.updateBundleObject(bundle);
        },

        decrementQuantityOfBundleItem(bundleItemId) {
            let bundle = this.getGlobalBundleFromLocalStorage();
            let bundleItem = bundle.find(bundleItem => bundleItem.id === bundleItemId);

            if (bundleItem.quantity === 1) {
                this.removeProductFromGlobalBundle(bundleItemId);

                return;
            }

            bundleItem.quantity -= 1;
            bundleItem.product.quantity -= 1;

            this.updateBundleObject(bundle);
        },

        incrementQuantityOfBundleItem(bundleItemId) {
            let bundle = this.getGlobalBundleFromLocalStorage();
            let bundleItem = bundle.find(bundleItem => bundleItem.id === bundleItemId);
            let quantity = parseInt(bundleItem.quantity)
            quantity += 1;
            bundleItem.quantity = quantity;
            bundleItem.product.quantity = quantity;

            this.updateBundleObject(bundle);
        },

        /**
         * Removes a product from the globalBundle.
         */
        removeProductFromGlobalBundle(bundleItemId) {
            let bundle = this.getGlobalBundleFromLocalStorage();
            bundle = bundle.filter(bundleItem => bundleItem.id !== bundleItemId);

            this.updateBundleObject(bundle);
        },

        /**
         * Get the globalBundle from local storage and set it to the globalBundle property.
         */
        loadGlobalBundle() {
            this.getBundleName();
            this.bundle.items = this.getGlobalBundleFromLocalStorage();
        },

        loadBundleIndex() {
            let bundleIndex = localStorage.getItem('globalBundleIndex');

            if (! bundleIndex) {
                localStorage.setItem('globalBundleIndex', '1');
                this.bundle.index = 1;

                return;
            }

            this.bundle.index = parseInt(bundleIndex);
        },

        getGlobalBundleFromLocalStorage() {
            return JSON.parse(localStorage.getItem('globalBundle')) ?? [];
        },

        getBundleName() {
            if (document.querySelector('[data-bundlename]')) {
                this.bundle.title = document.querySelector('[data-bundlename]')
                    .textContent
                    .trim();

                return
            }

            if (document.querySelector('[data-bundlename] *')) {
                this.bundle.title = document.querySelector('[data-bundlename] *')
                    .textContent
                    .trim();

                return
            }

            this.bundle.title = 'Bundle';
        },

        updateBundleIndex() {
            let globalBundleIndex = parseInt(localStorage.getItem('globalBundleIndex'));
            globalBundleIndex += 1;
            this.bundle.index = globalBundleIndex;
            localStorage.setItem('globalBundleIndex', globalBundleIndex.toString());
        },

        uniqueId() {
            return Math.trunc(Math.random() * 100000000);
        },

        /**
         * @deprecated
         */
        get globalBundle() {
            //console.warn('deprecated "get globalBundle" in handleGlobalBundle')
            return this.bundle;
        },
        /**
         * @deprecated
         */
        get bundleName() {
            //console.warn('deprecated "get bundleName" in handleGlobalBundle')
            return this.bundle.title;
        },
        /**
         * @deprecated
         */
        get bundleIndex() {
            //console.warn('deprecated "get bundleIndex" in handleGlobalBundle')
            return this.bundle.index;
        },
        /**
         * @deprecated
         */
        get useQuantity() {
            //console.warn('deprecated "get useQuantity" in handleGlobalBundle')
            return useQuantity;
        } ,

        /**
         * @deprecated
         */
        get shopMoneyFormat() {
            //console.warn('deprecated "get shopMoneyFormat" in handleGlobalBundle')
            return shopMoneyFormat;
        } ,
        /**
         * @deprecated
         */
        get total() {
            //console.warn('deprecated "get total" in handleGlobalBundle')
            return this.bundle.total;
        },
        /**
         * @deprecated
         */
        get totalFormatted() {
            //console.warn('deprecated "get totalFormatted" in handleGlobalBundle')
            return this.bundle.totalFormatted;
        },
    }));
})
