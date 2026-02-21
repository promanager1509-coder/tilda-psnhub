/**
 * PSNHUB CORE.JS v1.0.0
 * Единый движок каталога коммерческой недвижимости
 * 
 * Работает на всех 28 страницах через систему пресетов
 * Данные загружаются с GitHub через jsDelivr CDN
 */

(function() {
  'use strict';

  // ==========================================================================
  // КОНФИГУРАЦИЯ
  // ==========================================================================

  const CONFIG = {
    BASE_URL: 'https://cdn.jsdelivr.net/gh/promanager1509-coder/tilda-psnhub@main',
    CACHE_ENABLED: true,
    CACHE_TTL: 3600000, // 1 час
    VIRTUAL_SCROLL: true,
    ITEMS_PER_PAGE: 20,
    DEBUG: false
  };

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  const Utils = {
    log(...args) {
      if (CONFIG.DEBUG) console.log('[PSNHUB]', ...args);
    },

    error(...args) {
      console.error('[PSNHUB ERROR]', ...args);
    },

    formatPrice(price) {
      if (!price) return 'Цена не указана';
      const millions = (price / 1000000).toFixed(1);
      return `${millions} млн ₽`;
    },

    formatArea(area) {
      if (!area) return '';
      return `${area.toFixed(1)} м²`;
    },

    formatPricePerSqm(price) {
      if (!price) return '';
      return `${Math.round(price).toLocaleString('ru-RU')} ₽/м²`;
    },

    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    getFromCache(key) {
      if (!CONFIG.CACHE_ENABLED) return null;
      try {
        const item = localStorage.getItem(`psnhub_${key}`);
        if (!item) return null;
        const { data, timestamp } = JSON.parse(item);
        if (Date.now() - timestamp > CONFIG.CACHE_TTL) {
          localStorage.removeItem(`psnhub_${key}`);
          return null;
        }
        return data;
      } catch (e) {
        return null;
      }
    },

    setToCache(key, data) {
      if (!CONFIG.CACHE_ENABLED) return;
      try {
        localStorage.setItem(`psnhub_${key}`, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      } catch (e) {
        Utils.error('Cache write failed:', e);
      }
    }
  };

  // ==========================================================================
  // LOADER — ЗАГРУЗКА ДАННЫХ
  // ==========================================================================

  const Loader = {
    async fetchJSON(url) {
      Utils.log('Fetching:', url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${url}`);
      }
      return await response.json();
    },

    async loadManifest() {
      const cached = Utils.getFromCache('manifest');
      if (cached) {
        Utils.log('Manifest from cache');
        return cached;
      }

      const manifest = await this.fetchJSON(`${CONFIG.BASE_URL}/manifest.json`);
      Utils.setToCache('manifest', manifest);
      return manifest;
    },

    async loadFacets() {
      const cached = Utils.getFromCache('facets');
      if (cached) return cached;

      const facets = await this.fetchJSON(`${CONFIG.BASE_URL}/facets.json`);
      Utils.setToCache('facets', facets);
      return facets;
    },

    async loadKPI() {
      const cached = Utils.getFromCache('kpi');
      if (cached) return cached;

      const kpi = await this.fetchJSON(`${CONFIG.BASE_URL}/kpi.json`);
      Utils.setToCache('kpi', kpi);
      return kpi;
    },

    async loadChunk(chunkFile) {
      const cacheKey = `chunk_${chunkFile}`;
      const cached = Utils.getFromCache(cacheKey);
      if (cached) {
        Utils.log(`Chunk ${chunkFile} from cache`);
        return cached;
      }

      const url = `${CONFIG.BASE_URL}/${chunkFile}`;
      const data = await this.fetchJSON(url);
      Utils.setToCache(cacheKey, data);
      return data;
    },

    async loadAllChunks(manifest) {
      Utils.log('Loading all chunks...');
      const promises = manifest.chunks.map(chunk => this.loadChunk(chunk.file));
      const chunks = await Promise.all(promises);
      return chunks.flat();
    },

    async loadFilteredChunks(manifest, preset) {
      // Умная загрузка: только нужные чанки
      // TODO: в будущем можно оптимизировать
      return await this.loadAllChunks(manifest);
    }
  };

  // ==========================================================================
  // STATE — УПРАВЛЕНИЕ СОСТОЯНИЕМ
  // ==========================================================================

  const State = {
    units: [],
    filteredUnits: [],
    filters: {},
    preset: {},
    facets: {},
    kpi: {},
    currentPage: 1,

    init(preset = {}) {
      this.preset = preset;
      this.loadFiltersFromURL();
      this.loadFiltersFromLocalStorage();
      
      // Применяем пресет как начальные фильтры
      this.filters = { ...preset, ...this.filters };
    },

    setFilter(key, value) {
      if (value === null || value === undefined || value === '') {
        delete this.filters[key];
      } else {
        this.filters[key] = value;
      }
      this.saveFiltersToURL();
      this.saveFiltersToLocalStorage();
      this.currentPage = 1; // Сброс на первую страницу
    },

    toggleFilter(key, value) {
      // Для множественного выбора
      if (!this.filters[key]) {
        this.filters[key] = [value];
      } else if (Array.isArray(this.filters[key])) {
        const index = this.filters[key].indexOf(value);
        if (index > -1) {
          this.filters[key].splice(index, 1);
          if (this.filters[key].length === 0) {
            delete this.filters[key];
          }
        } else {
          this.filters[key].push(value);
        }
      } else {
        this.filters[key] = [this.filters[key], value];
      }
      this.saveFiltersToURL();
      this.saveFiltersToLocalStorage();
      this.currentPage = 1;
    },

    clearFilters() {
      this.filters = { ...this.preset }; // Оставляем только пресет
      this.currentPage = 1;
      this.saveFiltersToURL();
      this.saveFiltersToLocalStorage();
    },

    loadFiltersFromURL() {
      const params = new URLSearchParams(window.location.search);
      params.forEach((value, key) => {
        try {
          this.filters[key] = JSON.parse(value);
        } catch {
          this.filters[key] = value;
        }
      });
    },

    saveFiltersToURL() {
      const params = new URLSearchParams();
      Object.entries(this.filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          params.set(key, typeof value === 'object' ? JSON.stringify(value) : value);
        }
      });
      const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
      window.history.replaceState({}, '', newURL);
    },

    loadFiltersFromLocalStorage() {
      try {
        const saved = localStorage.getItem('psnhub_last_filters');
        if (saved) {
          const lastFilters = JSON.parse(saved);
          // Не перезаписываем фильтры из URL
          Object.keys(lastFilters).forEach(key => {
            if (!(key in this.filters)) {
              this.filters[key] = lastFilters[key];
            }
          });
        }
      } catch (e) {
        Utils.error('Failed to load filters from localStorage:', e);
      }
    },

    saveFiltersToLocalStorage() {
      try {
        localStorage.setItem('psnhub_last_filters', JSON.stringify(this.filters));
      } catch (e) {
        Utils.error('Failed to save filters to localStorage:', e);
      }
    }
  };

  // ==========================================================================
  // SELECTORS — ЛОГИКА ФИЛЬТРАЦИИ
  // ==========================================================================

  const Selectors = {
    applyFilters(units, filters) {
      Utils.log('Applying filters:', filters);
      let result = [...units];

      // Тип объекта
      if (filters.type) {
        result = result.filter(u => u.type === filters.type);
      }

      // Тип сделки
      if (filters.deal) {
        result = result.filter(u => u.deal === filters.deal);
      }

      // Застройщик (может быть массив)
      if (filters.developer) {
        const devs = Array.isArray(filters.developer) ? filters.developer : [filters.developer];
        result = result.filter(u => devs.includes(u.developer));
      }

      // Город
      if (filters.city) {
        result = result.filter(u => u.city === filters.city);
      }

      // Округ (только для Москвы)
      if (filters.district && filters.city === 'moscow') {
        result = result.filter(u => u.district === filters.district);
      }

      // Метро (для Москвы)
      if (filters.metro) {
        result = result.filter(u => u.metro && u.metro.includes(filters.metro));
      }

      // Ценовые диапазоны
      if (filters.price_min) {
        result = result.filter(u => u.price >= parseFloat(filters.price_min));
      }
      if (filters.price_max) {
        result = result.filter(u => u.price <= parseFloat(filters.price_max));
      }

      // Быстрые пресеты по цене
      if (filters.price_range) {
        switch (filters.price_range) {
          case 'до 30 млн':
            result = result.filter(u => u.price < 30000000);
            break;
          case '30-60 млн':
            result = result.filter(u => u.price >= 30000000 && u.price < 60000000);
            break;
          case '60-100 млн':
            result = result.filter(u => u.price >= 60000000 && u.price < 100000000);
            break;
          case '100+ млн':
            result = result.filter(u => u.price >= 100000000);
            break;
        }
      }

      // Площадь
      if (filters.area_min) {
        result = result.filter(u => u.area >= parseFloat(filters.area_min));
      }
      if (filters.area_max) {
        result = result.filter(u => u.area <= parseFloat(filters.area_max));
      }

      // Быстрые пресеты по площади
      if (filters.area_range) {
        switch (filters.area_range) {
          case 'до 50 м²':
            result = result.filter(u => u.area < 50);
            break;
          case '50-150 м²':
            result = result.filter(u => u.area >= 50 && u.area < 150);
            break;
          case '150-300 м²':
            result = result.filter(u => u.area >= 150 && u.area < 300);
            break;
          case '300+ м²':
            result = result.filter(u => u.area >= 300);
            break;
        }
      }

      // Этаж
      if (filters.floor) {
        if (filters.floor === '1') {
          result = result.filter(u => u.floor === 1);
        } else if (filters.floor === '2+') {
          result = result.filter(u => u.floor && u.floor > 1);
        }
      }

      // ГАБ
      if (filters.is_gab === true || filters.is_gab === 'true') {
        result = result.filter(u => u.is_gab === true);
      }

      // ROI (для инвесторов)
      if (filters.roi_min) {
        result = result.filter(u => u.roi && u.roi >= parseFloat(filters.roi_min));
      }

      // Окупаемость (для инвесторов)
      if (filters.payback_max) {
        result = result.filter(u => u.payback_years && u.payback_years <= parseFloat(filters.payback_max));
      }

      // Рассрочка
      if (filters.has_installment === true || filters.has_installment === 'true') {
        result = result.filter(u => u.has_installment === true);
      }

      // Ипотека
      if (filters.has_mortgage === true || filters.has_mortgage === 'true') {
        result = result.filter(u => u.has_mortgage === true);
      }

      // Текстовый поиск
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        result = result.filter(u => 
          u.jk?.toLowerCase().includes(searchLower) ||
          u.address?.toLowerCase().includes(searchLower) ||
          u.developer_name?.toLowerCase().includes(searchLower)
        );
      }

      Utils.log(`Filtered: ${result.length} units (from ${units.length})`);
      return result;
    },

    sortUnits(units, sortBy = 'price_asc') {
      const sorted = [...units];
      
      switch (sortBy) {
        case 'price_asc':
          sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
          break;
        case 'price_desc':
          sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
          break;
        case 'area_asc':
          sorted.sort((a, b) => (a.area || 0) - (b.area || 0));
          break;
        case 'area_desc':
          sorted.sort((a, b) => (b.area || 0) - (a.area || 0));
          break;
        case 'roi_desc':
          sorted.sort((a, b) => (b.roi || 0) - (a.roi || 0));
          break;
        case 'payback_asc':
          sorted.sort((a, b) => (a.payback_years || 999) - (b.payback_years || 999));
          break;
        default:
          // По умолчанию — по цене
          sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
      }

      return sorted;
    },

    computeDynamicFacets(units) {
      // Пересчёт доступных значений фильтров на основе текущей выборки
      const facets = {
        developers: {},
        types: {},
        cities: {},
        districts: {},
        price_ranges: {
          'до 30 млн': 0,
          '30-60 млн': 0,
          '60-100 млн': 0,
          '100+ млн': 0
        },
        area_ranges: {
          'до 50 м²': 0,
          '50-150 м²': 0,
          '150-300 м²': 0,
          '300+ м²': 0
        }
      };

      units.forEach(u => {
        // Застройщики
        facets.developers[u.developer] = (facets.developers[u.developer] || 0) + 1;
        
        // Типы
        facets.types[u.type] = (facets.types[u.type] || 0) + 1;
        
        // Города
        facets.cities[u.city] = (facets.cities[u.city] || 0) + 1;
        
        // Округа
        if (u.district) {
          facets.districts[u.district] = (facets.districts[u.district] || 0) + 1;
        }

        // Ценовые диапазоны
        if (u.price < 30000000) facets.price_ranges['до 30 млн']++;
        else if (u.price < 60000000) facets.price_ranges['30-60 млн']++;
        else if (u.price < 100000000) facets.price_ranges['60-100 млн']++;
        else facets.price_ranges['100+ млн']++;

        // Диапазоны площади
        if (u.area < 50) facets.area_ranges['до 50 м²']++;
        else if (u.area < 150) facets.area_ranges['50-150 м²']++;
        else if (u.area < 300) facets.area_ranges['150-300 м²']++;
        else facets.area_ranges['300+ м²']++;
      });

      return facets;
    }
  };

  // ==========================================================================
  // METRICS — РАСЧЁТ ИНВЕСТИЦИОННЫХ ПОКАЗАТЕЛЕЙ
  // ==========================================================================

  const Metrics = {
    calculateROI(unit) {
      if (!unit.rent_income_year || !unit.price) return null;
      return ((unit.rent_income_year / unit.price) * 100).toFixed(2);
    },

    calculatePayback(unit) {
      if (!unit.rent_income_year || !unit.price) return null;
      return (unit.price / unit.rent_income_year).toFixed(1);
    },

    enrichUnit(unit) {
      const enriched = { ...unit };
      
      // ROI
      if (!enriched.roi && enriched.rent_income_year && enriched.price) {
        enriched.roi = parseFloat(this.calculateROI(enriched));
      }
      
      // Окупаемость
      if (!enriched.payback_years && enriched.rent_income_year && enriched.price) {
        enriched.payback_years = parseFloat(this.calculatePayback(enriched));
      }
      
      // Цена за м²
      if (!enriched.price_per_sqm && enriched.price && enriched.area) {
        enriched.price_per_sqm = enriched.price / enriched.area;
      }

      return enriched;
    },

    enrichAllUnits(units) {
      return units.map(u => this.enrichUnit(u));
    }
  };

  // ==========================================================================
  // RENDER — ОТРИСОВКА UI
  // ==========================================================================

  const Render = {
    renderCard(unit) {
      const developerBadgeColors = {
        pik: '#E63946',
        samolet: '#1D3557',
        lsr: '#2A9D8F',
        mrgroup: '#7209B7',
        fsk: '#F77F00',
        a101: '#023E8A',
        brusnika: '#800F2F',
        donstroy: '#343A40',
        ingrad: '#06AED5',
        other: '#6C757D'
      };

      const typeLabels = {
        psn: 'ПСН',
        office: 'Офис',
        gab_ready: 'ГАБ',
        gab_franchise: 'ГАБ франшиза',
        retail: 'Торговое',
        warehouse: 'Склад'
      };

      const badgeColor = developerBadgeColors[unit.developer] || '#6C757D';
      const typeLabel = typeLabels[unit.type] || unit.type;

      return `
        <div class="psnhub-card" data-unit-id="${unit.id}" onclick="PSNHUB.goToUnit('${unit.id}')">
          <div class="psnhub-card__image">
            ${unit.plan_image ? `<img src="${unit.plan_image}" alt="${unit.jk}" loading="lazy">` : '<div class="psnhub-card__placeholder">Фото</div>'}
          </div>
          <div class="psnhub-card__badge" style="background: ${badgeColor}">
            ${unit.developer_name || unit.developer.toUpperCase()} ${unit.jk ? `| ${unit.jk}` : ''}
          </div>
          <div class="psnhub-card__type">
            ${typeLabel} • ${Utils.formatArea(unit.area)}${unit.floor ? ` • ${unit.floor} этаж` : ''}
          </div>
          <div class="psnhub-card__price">
            ${Utils.formatPrice(unit.price)}
          </div>
          ${unit.price_per_sqm ? `<div class="psnhub-card__price-sqm">${Utils.formatPricePerSqm(unit.price_per_sqm)}</div>` : ''}
          <div class="psnhub-card__location">
            <div>${unit.city_name || (unit.city === 'moscow' ? 'Москва' : 'МО')}</div>
            ${unit.metro ? `<div class="psnhub-card__metro">M ${unit.metro}${unit.metro_time ? ` • ${unit.metro_time} мин` : ''}</div>` : ''}
          </div>
          ${unit.roi ? `
            <div class="psnhub-card__roi">
              <span class="psnhub-card__roi-label">Доходность:</span>
              <span class="psnhub-card__roi-value">${unit.roi}% годовых</span>
            </div>
          ` : ''}
          ${unit.payback_years ? `
            <div class="psnhub-card__payback">Окупаемость: ${unit.payback_years} лет</div>
          ` : ''}
        </div>
      `;
    },

    renderList(units, page = 1) {
      const container = document.getElementById('psnhub-catalog');
      if (!container) {
        Utils.error('Catalog container not found');
        return;
      }

      if (units.length === 0) {
        container.innerHTML = `
          <div class="psnhub-empty">
            <div class="psnhub-empty__icon">🔍</div>
            <div class="psnhub-empty__title">Объекты не найдены</div>
            <div class="psnhub-empty__text">Попробуйте изменить фильтры</div>
            <button class="psnhub-btn psnhub-btn--secondary" onclick="PSNHUB.State.clearFilters(); PSNHUB.render();">
              Сбросить фильтры
            </button>
          </div>
        `;
        return;
      }

      const start = (page - 1) * CONFIG.ITEMS_PER_PAGE;
      const end = start + CONFIG.ITEMS_PER_PAGE;
      const pageUnits = units.slice(start, end);

      const html = pageUnits.map(u => this.renderCard(u)).join('');
      container.innerHTML = `<div class="psnhub-grid">${html}</div>`;

      // Pagination
      if (units.length > CONFIG.ITEMS_PER_PAGE) {
        this.renderPagination(units.length, page);
      }

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    renderPagination(totalUnits, currentPage) {
      const container = document.getElementById('psnhub-pagination');
      if (!container) return;

      const totalPages = Math.ceil(totalUnits / CONFIG.ITEMS_PER_PAGE);
      if (totalPages <= 1) {
        container.innerHTML = '';
        return;
      }

      let html = '<div class="psnhub-pagination">';
      
      // Previous
      if (currentPage > 1) {
        html += `<button class="psnhub-pagination__btn" onclick="PSNHUB.goToPage(${currentPage - 1})">←</button>`;
      }

      // Pages
      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
          const active = i === currentPage ? 'psnhub-pagination__btn--active' : '';
          html += `<button class="psnhub-pagination__btn ${active}" onclick="PSNHUB.goToPage(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
          html += '<span class="psnhub-pagination__dots">...</span>';
        }
      }

      // Next
      if (currentPage < totalPages) {
        html += `<button class="psnhub-pagination__btn" onclick="PSNHUB.goToPage(${currentPage + 1})">→</button>`;
      }

      html += '</div>';
      container.innerHTML = html;
    },

    renderKPI(units) {
      const container = document.getElementById('psnhub-kpi');
      if (!container) return;

      container.innerHTML = `
        <div class="psnhub-kpi">
          <div class="psnhub-kpi__item">
            <div class="psnhub-kpi__value">${units.length}</div>
            <div class="psnhub-kpi__label">Найдено объектов</div>
          </div>
        </div>
      `;
    },

    renderFilters(facets, currentFilters) {
      // TODO: Implement filter UI rendering
      // This will be done in next step
      Utils.log('Render filters:', facets);
    },

    showLoader() {
      const loader = document.getElementById('psnhub-loader');
      if (loader) loader.style.display = 'flex';
    },

    hideLoader() {
      const loader = document.getElementById('psnhub-loader');
      if (loader) loader.style.display = 'none';
    }
  };

  // ==========================================================================
  // ГЛАВНЫЙ КЛАСС PSNHUB
  // ==========================================================================

  window.PSNHUB = {
    State,
    Loader,
    Selectors,
    Metrics,
    Render,
    Utils,

    async init(preset = {}) {
      try {
        Utils.log('PSNHUB initializing...', preset);
        Render.showLoader();

        // 1. Инициализируем состояние
        State.init(preset);

        // 2. Загружаем manifest
        const manifest = await Loader.loadManifest();
        Utils.log('Manifest loaded:', manifest);

        // 3. Загружаем facets
        State.facets = await Loader.loadFacets();
        Utils.log('Facets loaded:', State.facets);

        // 4. Загружаем KPI
        State.kpi = await Loader.loadKPI();
        Utils.log('KPI loaded:', State.kpi);

        // 5. Загружаем данные
        const units = await Loader.loadFilteredChunks(manifest, preset);
        Utils.log(`Loaded ${units.length} units`);

        // 6. Обогащаем метриками
        State.units = Metrics.enrichAllUnits(units);
        Utils.log('Units enriched with metrics');

        // 7. Рендерим
        this.render();

        Render.hideLoader();
        Utils.log('PSNHUB initialized successfully');

      } catch (error) {
        Utils.error('Initialization failed:', error);
        Render.hideLoader();
        alert('Ошибка загрузки данных. Пожалуйста, обновите страницу.');
      }
    },

    render() {
      Utils.log('Rendering with filters:', State.filters);

      // 1. Применяем фильтры
      State.filteredUnits = Selectors.applyFilters(State.units, State.filters);

      // 2. Сортируем
      State.filteredUnits = Selectors.sortUnits(State.filteredUnits, State.filters.sort || 'price_asc');

      // 3. Рендерим список
      Render.renderList(State.filteredUnits, State.currentPage);

      // 4. Рендерим KPI
      Render.renderKPI(State.filteredUnits);

      // 5. Обновляем фильтры (динамические facets)
      const dynamicFacets = Selectors.computeDynamicFacets(State.filteredUnits);
      Render.renderFilters(dynamicFacets, State.filters);
    },

    setFilter(key, value) {
      State.setFilter(key, value);
      this.render();
    },

    toggleFilter(key, value) {
      State.toggleFilter(key, value);
      this.render();
    },

    clearFilters() {
      State.clearFilters();
      this.render();
    },

    goToPage(page) {
      State.currentPage = page;
      this.render();
    },

    goToUnit(unitId) {
      // TODO: Navigate to unit detail page
      Utils.log('Go to unit:', unitId);
      const unit = State.units.find(u => u.id === unitId);
      if (unit && unit.url) {
        window.open(unit.url, '_blank');
      }
    }
  };

  // Auto-init if PAGE_PRESET is defined
  if (window.PAGE_PRESET) {
    document.addEventListener('DOMContentLoaded', () => {
      PSNHUB.init(window.PAGE_PRESET);
    });
  }

})();
