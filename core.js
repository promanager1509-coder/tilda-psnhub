/**
 * PSNHUB / ДомРадар runtime
 * Transitional live version for Tilda.
 * Product logic follows the new DomRadar preset navigation model.
 */

(function() {
  'use strict';

  var CONFIG = {
    BASE_URL: 'https://cdn.jsdelivr.net/gh/promanager1509-coder/tilda-psnhub@main',
    ITEMS_PER_PAGE: 12,
    CACHE_TTL: 15 * 60 * 1000,
    DEBUG: false
  };

  var ENTRANCES = [
    {
      id: 'new_buildings',
      title: 'Новостройки коммерции',
      description: 'Коммерческие помещения в новых проектах'
    },
    {
      id: 'business_centers',
      title: 'Бизнес-центры',
      description: 'Офисы и площади в готовых зданиях'
    },
    {
      id: 'market_participants',
      title: 'Участники рынка',
      description: 'Девелоперы, собственники, управляющие компании'
    },
    {
      id: 'risk_registry',
      title: 'Реестр риска',
      description: 'Долгострой, банкротства, суды и другие сигналы'
    }
  ];

  var SCENARIOS = [
    { id: 'buy', title: 'Купить', entrances: ['new_buildings', 'business_centers'] },
    { id: 'rent', title: 'Арендовать', entrances: ['new_buildings', 'business_centers'] },
    { id: 'invest', title: 'Инвестировать', entrances: ['new_buildings', 'business_centers'] },
    { id: 'tenant', title: 'С арендатором', entrances: ['new_buildings', 'business_centers'] },
    { id: 'construction', title: 'В строящемся проекте', entrances: ['new_buildings'] },
    { id: 'ready', title: 'В готовом объекте', entrances: ['new_buildings', 'business_centers'] }
  ];

  var GEO = {
    regions: [
      {
        id: 'moscow',
        title: 'Москва',
        okrugs: [
          { id: 'cao', title: 'ЦАО', districts: [] },
          { id: 'sao', title: 'САО', districts: [] },
          { id: 'svao', title: 'СВАО', districts: [] },
          { id: 'vao', title: 'ВАО', districts: ['Авиамоторная', 'Шоссе Энтузиастов', 'Новогиреево', 'Перово', 'Соколиная Гора', 'Некрасовка'] },
          { id: 'uvao', title: 'ЮВАО', districts: [] },
          { id: 'uao', title: 'ЮАО', districts: [] },
          { id: 'uzao', title: 'ЮЗАО', districts: [] },
          { id: 'zao', title: 'ЗАО', districts: [] },
          { id: 'szao', title: 'СЗАО', districts: [] },
          { id: 'tinao', title: 'ТиНАО', districts: [] }
        ]
      },
      { id: 'moscow_oblast', title: 'Московская область', okrugs: [] },
      { id: 'saint_petersburg', title: 'Санкт-Петербург', okrugs: [] },
      { id: 'regions', title: 'Регионы', okrugs: [] }
    ]
  };

  var PARAM_GROUPS = [
    {
      key: 'area',
      title: 'Площадь',
      type: 'single',
      options: [
        { id: 'lt50', title: 'до 50 м2' },
        { id: '50_150', title: '50-150 м2' },
        { id: '150_300', title: '150-300 м2' },
        { id: 'gt300', title: '300+ м2' }
      ]
    },
    {
      key: 'budget',
      title: 'Бюджет',
      type: 'single',
      options: [
        { id: 'lt30m', title: 'до 30 млн' },
        { id: '30_60m', title: '30-60 млн' },
        { id: '60_100m', title: '60-100 млн' },
        { id: 'gt100m', title: '100+ млн' }
      ]
    },
    {
      key: 'property_type',
      title: 'Назначение',
      type: 'multi',
      options: [
        { id: 'psn', title: 'ПСН' },
        { id: 'office', title: 'Офис' },
        { id: 'gab_ready', title: 'ГАБ' },
        { id: 'warehouse', title: 'Склад' }
      ]
    },
    {
      key: 'features',
      title: 'Критичные параметры',
      type: 'multi',
      options: [
        { id: 'first_line', title: 'Первая линия' },
        { id: 'showcase_windows', title: 'Витрина' },
        { id: 'parking', title: 'Парковка' },
        { id: 'construction', title: 'Строится' },
        { id: 'ready', title: 'Готовый объект' }
      ]
    }
  ];

  var OKRUG_MAP = {
    'ЦАО': 'cao',
    'САО': 'sao',
    'СВАО': 'svao',
    'ВАО': 'vao',
    'ЮВАО': 'uvao',
    'ЮАО': 'uao',
    'ЮЗАО': 'uzao',
    'ЗАО': 'zao',
    'СЗАО': 'szao',
    'ТИНАО': 'tinao',
    'ТиНАО': 'tinao'
  };

  var Utils = {
    log: function() {
      if (CONFIG.DEBUG) console.log.apply(console, ['[DomRadar]'].concat([].slice.call(arguments)));
    },

    cacheGet: function(key) {
      try {
        var raw = localStorage.getItem('domradar_' + key);
        if (!raw) return null;
        var payload = JSON.parse(raw);
        if (Date.now() - payload.timestamp > CONFIG.CACHE_TTL) return null;
        return payload.data;
      } catch (error) {
        return null;
      }
    },

    cacheSet: function(key, data) {
      try {
        localStorage.setItem('domradar_' + key, JSON.stringify({
          timestamp: Date.now(),
          data: data
        }));
      } catch (error) {
        Utils.log('Cache disabled', error);
      }
    },

    fetchJSON: function(url) {
      return fetch(url).then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ': ' + url);
        }
        return response.json();
      });
    },

    formatPrice: function(value) {
      if (!value) return 'Цена по запросу';
      return Math.round(value).toLocaleString('ru-RU') + ' ₽';
    },

    formatCompactPrice: function(value) {
      if (!value) return 'Цена по запросу';
      if (value >= 1000000) {
        return (value / 1000000).toFixed(1).replace('.0', '') + ' млн ₽';
      }
      return Math.round(value).toLocaleString('ru-RU') + ' ₽';
    },

    formatArea: function(value) {
      if (!value) return '';
      return String(Math.round(value * 10) / 10).replace('.0', '') + ' м2';
    },

    escapeHTML: function(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };

  function createDefaultState() {
    return {
      entrance: null,
      scenario: null,
      geo: {
        region: null,
        okrug: null,
        district: null
      },
      params: {},
      currentPage: 1
    };
  }

  var State = {
    rawUnits: [],
    units: [],
    results: [],
    ui: createDefaultState(),

    loadFromURL: function() {
      var params = new URLSearchParams(window.location.search);
      if (params.get('entrance')) this.ui.entrance = params.get('entrance');
      if (params.get('scenario')) this.ui.scenario = params.get('scenario');
      if (params.get('region')) this.ui.geo.region = params.get('region');
      if (params.get('okrug')) this.ui.geo.okrug = params.get('okrug');
      if (params.get('district')) this.ui.geo.district = params.get('district');
    },

    saveToURL: function() {
      var params = new URLSearchParams();
      if (this.ui.entrance) params.set('entrance', this.ui.entrance);
      if (this.ui.scenario) params.set('scenario', this.ui.scenario);
      if (this.ui.geo.region) params.set('region', this.ui.geo.region);
      if (this.ui.geo.okrug) params.set('okrug', this.ui.geo.okrug);
      if (this.ui.geo.district) params.set('district', this.ui.geo.district);
      var newURL = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState({}, '', newURL);
    },

    setEntrance: function(value) {
      this.ui.entrance = value;
      this.ui.currentPage = 1;
      this.saveToURL();
    },

    setScenario: function(value) {
      this.ui.scenario = value;
      this.ui.currentPage = 1;
      this.saveToURL();
    },

    setRegion: function(value) {
      this.ui.geo.region = value;
      this.ui.geo.okrug = null;
      this.ui.geo.district = null;
      this.ui.currentPage = 1;
      this.saveToURL();
    },

    setOkrug: function(value) {
      this.ui.geo.okrug = value;
      this.ui.geo.district = null;
      this.ui.currentPage = 1;
      this.saveToURL();
    },

    setDistrict: function(value) {
      this.ui.geo.district = value;
      this.ui.currentPage = 1;
      this.saveToURL();
    },

    toggleParam: function(groupKey, optionId, mode) {
      if (mode === 'single') {
        this.ui.params[groupKey] = this.ui.params[groupKey] === optionId ? null : optionId;
        if (!this.ui.params[groupKey]) delete this.ui.params[groupKey];
      } else {
        var current = this.ui.params[groupKey] || [];
        var next = current.slice();
        var index = next.indexOf(optionId);
        if (index === -1) next.push(optionId);
        else next.splice(index, 1);
        if (next.length) this.ui.params[groupKey] = next;
        else delete this.ui.params[groupKey];
      }
      this.ui.currentPage = 1;
    },

    clearAll: function() {
      this.ui = createDefaultState();
      this.saveToURL();
    }
  };

  var Loader = {
    loadManifest: function() {
      var cached = Utils.cacheGet('manifest');
      if (cached) return Promise.resolve(cached);
      return Utils.fetchJSON(CONFIG.BASE_URL + '/manifest.json').then(function(data) {
        Utils.cacheSet('manifest', data);
        return data;
      });
    },

    loadChunk: function(chunkFile) {
      var cacheKey = 'chunk_' + chunkFile;
      var cached = Utils.cacheGet(cacheKey);
      if (cached) return Promise.resolve(cached);
      return Utils.fetchJSON(CONFIG.BASE_URL + '/' + chunkFile).then(function(data) {
        Utils.cacheSet(cacheKey, data);
        return data;
      });
    },

    loadUnits: function() {
      return this.loadManifest().then(function(manifest) {
        return Promise.all(manifest.chunks.map(function(chunk) {
          return Loader.loadChunk(chunk.file);
        }));
      }).then(function(chunkSets) {
        return chunkSets.reduce(function(acc, chunk) {
          return acc.concat(chunk);
        }, []);
      });
    }
  };

  var Mapper = {
    inferOkrugAndDistrict: function(rawDistrict) {
      var value = (rawDistrict || '').trim();
      var upper = value.toUpperCase();
      if (OKRUG_MAP[upper] || OKRUG_MAP[value]) {
        return {
          okrug: OKRUG_MAP[upper] || OKRUG_MAP[value],
          district: null
        };
      }
      return {
        okrug: null,
        district: value || null
      };
    },

    inferEntrance: function(unit) {
      if (unit.type === 'office') return 'business_centers';
      if (unit.status === 'construction') return 'new_buildings';
      return 'business_centers';
    },

    mapUnit: function(unit) {
      var geo = this.inferOkrugAndDistrict(unit.district);
      return {
        object_id: unit.id,
        entrance_type: this.inferEntrance(unit),
        title: unit.jk || unit.number || unit.type_label || unit.type || 'Объект',
        project_name: unit.jk || null,
        property_type: unit.type || null,
        deal_type: unit.deal || null,
        price: typeof unit.price === 'number' ? unit.price : null,
        price_per_m2: typeof unit.price_per_sqm === 'number' ? unit.price_per_sqm : null,
        area_total: typeof unit.area === 'number' ? unit.area : null,
        floor: typeof unit.floor === 'number' ? unit.floor : null,
        floors_total: typeof unit.floors_total === 'number' ? unit.floors_total : null,
        first_line: Boolean(unit.first_line),
        showcase_windows: Boolean(unit.showcase_windows),
        parking: Boolean(unit.has_parking),
        building_status: unit.status || null,
        region: unit.city === 'moscow' ? 'moscow' : unit.city === 'mo' ? 'moscow_oblast' : null,
        city: unit.city || null,
        city_name: unit.city_name || null,
        okrug: geo.okrug,
        district: geo.district,
        metro: unit.metro || null,
        address_text: unit.address || null,
        developer_id: unit.developer || null,
        developer_name: unit.developer_name || null,
        external_url: unit.url || null,
        roi: unit.roi || null,
        payback_years: unit.payback_years || null,
        source_name: unit.source || unit.source_feed || null
      };
    }
  };

  var Selectors = {
    adaptLegacyPreset: function(preset) {
      var next = createDefaultState();
      if (!preset) return next;

      if (preset.city === 'moscow') next.geo.region = 'moscow';
      if (preset.city === 'mo') next.geo.region = 'moscow_oblast';
      if (preset.deal === 'rent') next.scenario = 'rent';
      if (preset.deal === 'sale') next.scenario = 'buy';
      if (preset.type === 'office') next.entrance = 'business_centers';
      if (preset.status === 'construction') next.entrance = 'new_buildings';
      if (!next.entrance && preset.type) next.entrance = 'new_buildings';

      return next;
    },

    getEntranceById: function(id) {
      return ENTRANCES.find(function(item) { return item.id === id; }) || null;
    },

    getScenarioById: function(id) {
      return SCENARIOS.find(function(item) { return item.id === id; }) || null;
    },

    getAvailableScenarios: function(entrance) {
      if (!entrance) return SCENARIOS;
      return SCENARIOS.filter(function(item) {
        return item.entrances.indexOf(entrance) !== -1;
      });
    },

    getRegionById: function(id) {
      return GEO.regions.find(function(item) { return item.id === id; }) || null;
    },

    getOkrugs: function(regionId) {
      var region = this.getRegionById(regionId);
      return region ? region.okrugs : [];
    },

    getDistricts: function(regionId, okrugId) {
      var okrugs = this.getOkrugs(regionId);
      var okrug = okrugs.find(function(item) { return item.id === okrugId; });
      return okrug ? okrug.districts : [];
    },

    applyScenario: function(units, scenario) {
      if (!scenario) return units;
      switch (scenario) {
        case 'buy':
          return units.filter(function(unit) { return unit.deal_type === 'sale'; });
        case 'rent':
          return units.filter(function(unit) { return unit.deal_type === 'rent'; });
        case 'invest':
          return units.filter(function(unit) { return unit.roi || unit.payback_years || unit.property_type === 'gab_ready'; });
        case 'tenant':
          return units.filter(function(unit) { return unit.property_type === 'gab_ready' || unit.property_type === 'gab_franchise'; });
        case 'construction':
          return units.filter(function(unit) { return unit.building_status === 'construction'; });
        case 'ready':
          return units.filter(function(unit) { return unit.building_status === 'ready'; });
        default:
          return units;
      }
    },

    applyGeo: function(units, geo) {
      var result = units.slice();
      if (geo.region) {
        result = result.filter(function(unit) { return unit.region === geo.region; });
      }
      if (geo.okrug) {
        result = result.filter(function(unit) { return unit.okrug === geo.okrug; });
      }
      if (geo.district) {
        result = result.filter(function(unit) {
          return unit.district === geo.district || unit.metro === geo.district;
        });
      }
      return result;
    },

    applyParams: function(units, params) {
      var result = units.slice();

      if (params.area) {
        result = result.filter(function(unit) {
          var area = unit.area_total || 0;
          switch (params.area) {
            case 'lt50': return area < 50;
            case '50_150': return area >= 50 && area < 150;
            case '150_300': return area >= 150 && area < 300;
            case 'gt300': return area >= 300;
            default: return true;
          }
        });
      }

      if (params.budget) {
        result = result.filter(function(unit) {
          var price = unit.price || 0;
          switch (params.budget) {
            case 'lt30m': return price < 30000000;
            case '30_60m': return price >= 30000000 && price < 60000000;
            case '60_100m': return price >= 60000000 && price < 100000000;
            case 'gt100m': return price >= 100000000;
            default: return true;
          }
        });
      }

      if (params.property_type && params.property_type.length) {
        result = result.filter(function(unit) {
          return params.property_type.indexOf(unit.property_type) !== -1;
        });
      }

      if (params.features && params.features.length) {
        result = result.filter(function(unit) {
          return params.features.every(function(feature) {
            if (feature === 'construction') return unit.building_status === 'construction';
            if (feature === 'ready') return unit.building_status === 'ready';
            return Boolean(unit[feature]);
          });
        });
      }

      return result;
    },

    applyAll: function(units, uiState) {
      if (uiState.entrance === 'market_participants' || uiState.entrance === 'risk_registry') {
        return [];
      }

      var result = units.slice();

      if (uiState.entrance) {
        result = result.filter(function(unit) { return unit.entrance_type === uiState.entrance; });
      }

      result = this.applyScenario(result, uiState.scenario);
      result = this.applyGeo(result, uiState.geo);
      result = this.applyParams(result, uiState.params);

      return result.sort(function(a, b) {
        return (a.price || 0) - (b.price || 0);
      });
    },

    getStep: function(uiState) {
      if (!uiState.entrance) return 1;
      if (!uiState.scenario) return 2;
      if (!uiState.geo.region) return 3;
      if (Object.keys(uiState.params).length === 0) return 4;
      return 5;
    },

    getSummary: function(uiState) {
      var parts = [];
      var entrance = this.getEntranceById(uiState.entrance);
      var scenario = this.getScenarioById(uiState.scenario);
      var region = this.getRegionById(uiState.geo.region);

      if (entrance) parts.push(entrance.title);
      if (scenario) parts.push(scenario.title);
      if (region) parts.push(region.title);

      var okrugs = this.getOkrugs(uiState.geo.region);
      var okrug = okrugs.find(function(item) { return item.id === uiState.geo.okrug; });
      if (okrug) parts.push(okrug.title);
      if (uiState.geo.district) parts.push(uiState.geo.district);

      return parts;
    }
  };

  var Render = {
    mountRoot: function() {
      var host = document.getElementById('psnhub-catalog');
      if (!host) {
        host = document.createElement('section');
        host.id = 'psnhub-catalog';
        document.body.appendChild(host);
      }
      host.className = 'domradar-app';
      return host;
    },

    render: function() {
      State.results = Selectors.applyAll(State.units, State.ui);
      var host = this.mountRoot();
      host.innerHTML = this.renderShell();
      this.bindEvents(host);
    },

    renderShell: function() {
      var step = Selectors.getStep(State.ui);
      var summary = Selectors.getSummary(State.ui);
      var resultCount = State.results.length;

      return [
        '<div class="domradar-shell">',
        this.renderHero(step, summary, resultCount),
        this.renderEntrances(),
        this.renderScenarios(),
        this.renderGeo(),
        this.renderParams(),
        this.renderResults(),
        '</div>'
      ].join('');
    },

    renderHero: function(step, summary, resultCount) {
      var pills = summary.length
        ? summary.map(function(item) {
            return '<span class="domradar-summary-pill">' + Utils.escapeHTML(item) + '</span>';
          }).join('')
        : '<span class="domradar-summary-empty">Маршрут еще не выбран</span>';

      return [
        '<section class="domradar-hero">',
        '<div class="domradar-hero__eyebrow">ДомРадар / тестовая живая сборка</div>',
        '<h1 class="domradar-hero__title">Маршрут по коммерческой недвижимости без текстового поиска</h1>',
        '<p class="domradar-hero__text">Выберите вход, сценарий, географию и критичные параметры. Сайт уже работает на живых данных текущего репозитория.</p>',
        '<div class="domradar-hero__meta">',
        '<div class="domradar-step">Шаг ' + step + ' из 5</div>',
        '<button class="domradar-reset" data-action="reset">Сбросить маршрут</button>',
        '</div>',
        '<div class="domradar-summary">' + pills + '</div>',
        '<div class="domradar-kpi">',
        '<div class="domradar-kpi__item"><span class="domradar-kpi__value">' + State.units.length + '</span><span class="domradar-kpi__label">объектов в базе</span></div>',
        '<div class="domradar-kpi__item"><span class="domradar-kpi__value">' + resultCount + '</span><span class="domradar-kpi__label">в текущей выдаче</span></div>',
        '</div>',
        '</section>'
      ].join('');
    },

    renderEntrances: function() {
      return [
        '<section class="domradar-section">',
        '<div class="domradar-section__head"><h2>1. Вход</h2><p>Четыре продукта, разные сценарии работы</p></div>',
        '<div class="domradar-cards">',
        ENTRANCES.map(function(item) {
          var active = State.ui.entrance === item.id ? ' is-active' : '';
          return [
            '<button class="domradar-card' + active + '" data-action="set-entrance" data-value="' + item.id + '">',
            '<span class="domradar-card__title">' + Utils.escapeHTML(item.title) + '</span>',
            '<span class="domradar-card__text">' + Utils.escapeHTML(item.description) + '</span>',
            '</button>'
          ].join('');
        }).join(''),
        '</div>',
        '</section>'
      ].join('');
    },

    renderScenarios: function() {
      var scenarios = Selectors.getAvailableScenarios(State.ui.entrance);
      return [
        '<section class="domradar-section">',
        '<div class="domradar-section__head"><h2>2. Что ищем</h2><p>Сценарий можно менять независимо от географии</p></div>',
        '<div class="domradar-chips">',
        scenarios.map(function(item) {
          var active = State.ui.scenario === item.id ? ' is-active' : '';
          return '<button class="domradar-chip' + active + '" data-action="set-scenario" data-value="' + item.id + '">' + Utils.escapeHTML(item.title) + '</button>';
        }).join(''),
        '</div>',
        '</section>'
      ].join('');
    },

    renderGeo: function() {
      var okrugs = Selectors.getOkrugs(State.ui.geo.region);
      var districts = Selectors.getDistricts(State.ui.geo.region, State.ui.geo.okrug);
      return [
        '<section class="domradar-section">',
        '<div class="domradar-section__head"><h2>3. Где ищем</h2><p>География раскрывается каскадом</p></div>',
        '<div class="domradar-geo">',
        '<div class="domradar-geo__group"><div class="domradar-geo__label">Регион</div><div class="domradar-chips">',
        GEO.regions.map(function(item) {
          var active = State.ui.geo.region === item.id ? ' is-active' : '';
          return '<button class="domradar-chip' + active + '" data-action="set-region" data-value="' + item.id + '">' + Utils.escapeHTML(item.title) + '</button>';
        }).join(''),
        '</div></div>',
        okrugs.length ? '<div class="domradar-geo__group"><div class="domradar-geo__label">Округ</div><div class="domradar-chips">' + okrugs.map(function(item) {
          var active = State.ui.geo.okrug === item.id ? ' is-active' : '';
          return '<button class="domradar-chip' + active + '" data-action="set-okrug" data-value="' + item.id + '">' + Utils.escapeHTML(item.title) + '</button>';
        }).join('') + '</div></div>' : '',
        districts.length ? '<div class="domradar-geo__group"><div class="domradar-geo__label">Район / метро</div><div class="domradar-chips">' + districts.map(function(item) {
          var active = State.ui.geo.district === item ? ' is-active' : '';
          return '<button class="domradar-chip' + active + '" data-action="set-district" data-value="' + Utils.escapeHTML(item) + '">' + Utils.escapeHTML(item) + '</button>';
        }).join('') + '</div></div>' : '',
        '</div>',
        '</section>'
      ].join('');
    },

    renderParams: function() {
      return [
        '<section class="domradar-section">',
        '<div class="domradar-section__head"><h2>4. Критичные параметры</h2><p>Без длинных форм, только готовые пресеты</p></div>',
        '<div class="domradar-param-groups">',
        PARAM_GROUPS.map(function(group) {
          return [
            '<div class="domradar-param-group">',
            '<div class="domradar-param-group__title">' + Utils.escapeHTML(group.title) + '</div>',
            '<div class="domradar-chips">',
            group.options.map(function(option) {
              var value = State.ui.params[group.key];
              var active = Array.isArray(value) ? value.indexOf(option.id) !== -1 : value === option.id;
              return '<button class="domradar-chip' + (active ? ' is-active' : '') + '" data-action="toggle-param" data-group="' + group.key + '" data-mode="' + group.type + '" data-value="' + option.id + '">' + Utils.escapeHTML(option.title) + '</button>';
            }).join(''),
            '</div>',
            '</div>'
          ].join('');
        }).join(''),
        '</div>',
        '</section>'
      ].join('');
    },

    renderResults: function() {
      if (State.ui.entrance === 'market_participants') {
        return this.renderComingSoon('Раздел участников рынка выведем следующим шагом из отдельного company-справочника.');
      }

      if (State.ui.entrance === 'risk_registry') {
        return this.renderComingSoon('Реестр риска будет отдельным слоем поверх объектов и компаний, а не фильтром старого каталога.');
      }

      if (!State.results.length) {
        return [
          '<section class="domradar-section">',
          '<div class="domradar-section__head"><h2>5. Выдача</h2><p>Текущая выборка на живых данных</p></div>',
          '<div class="domradar-empty">',
          '<div class="domradar-empty__title">Ничего не найдено</div>',
          '<div class="domradar-empty__text">Измените маршрут или снимите часть пресетов. Тестовый сайт сейчас работает на переходной базе.</div>',
          '</div>',
          '</section>'
        ].join('');
      }

      var start = (State.ui.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
      var items = State.results.slice(start, start + CONFIG.ITEMS_PER_PAGE);
      return [
        '<section class="domradar-section">',
        '<div class="domradar-section__head"><h2>5. Выдача</h2><p>Переходная витрина на текущих объектах репозитория</p></div>',
        '<div class="domradar-grid">',
        items.map(this.renderCard).join(''),
        '</div>',
        this.renderPagination(),
        '</section>'
      ].join('');
    },

    renderComingSoon: function(text) {
      return [
        '<section class="domradar-section">',
        '<div class="domradar-section__head"><h2>5. Выдача</h2><p>Раздел уже включен в навигацию, но еще не запитан новыми данными</p></div>',
        '<div class="domradar-empty">',
        '<div class="domradar-empty__title">Раздел в сборке</div>',
        '<div class="domradar-empty__text">' + Utils.escapeHTML(text) + '</div>',
        '</div>',
        '</section>'
      ].join('');
    },

    renderCard: function(unit) {
      var chips = [];
      if (unit.property_type) chips.push(unit.property_type.toUpperCase());
      if (unit.area_total) chips.push(Utils.formatArea(unit.area_total));
      if (unit.building_status === 'construction') chips.push('строится');
      if (unit.building_status === 'ready') chips.push('готовый');

      return [
        '<article class="domradar-result-card">',
        '<div class="domradar-result-card__meta">' + chips.map(function(chip) {
          return '<span class="domradar-mini-chip">' + Utils.escapeHTML(chip) + '</span>';
        }).join('') + '</div>',
        '<h3 class="domradar-result-card__title">' + Utils.escapeHTML(unit.title) + '</h3>',
        '<div class="domradar-result-card__price">' + Utils.formatCompactPrice(unit.price) + '</div>',
        unit.price_per_m2 ? '<div class="domradar-result-card__subprice">' + Utils.formatPrice(unit.price_per_m2) + ' / м2</div>' : '',
        '<div class="domradar-result-card__location">' + Utils.escapeHTML(unit.city_name || unit.city || 'Локация уточняется') + (unit.district ? ' · ' + Utils.escapeHTML(unit.district) : '') + '</div>',
        unit.address_text ? '<div class="domradar-result-card__address">' + Utils.escapeHTML(unit.address_text) + '</div>' : '',
        '<div class="domradar-result-card__footer">',
        '<div class="domradar-result-card__developer">' + Utils.escapeHTML(unit.developer_name || 'Источник') + '</div>',
        unit.external_url ? '<button class="domradar-open-link" data-action="open-unit" data-url="' + Utils.escapeHTML(unit.external_url) + '">Открыть источник</button>' : '',
        '</div>',
        '</article>'
      ].join('');
    },

    renderPagination: function() {
      var totalPages = Math.ceil(State.results.length / CONFIG.ITEMS_PER_PAGE);
      if (totalPages <= 1) return '';

      var parts = ['<div class="domradar-pagination">'];
      for (var page = 1; page <= totalPages; page += 1) {
        parts.push('<button class="domradar-page' + (page === State.ui.currentPage ? ' is-active' : '') + '" data-action="go-page" data-value="' + page + '">' + page + '</button>');
      }
      parts.push('</div>');
      return parts.join('');
    },

    bindEvents: function(host) {
      host.querySelectorAll('[data-action]').forEach(function(node) {
        node.addEventListener('click', function(event) {
          var action = event.currentTarget.getAttribute('data-action');
          var value = event.currentTarget.getAttribute('data-value');

          if (action === 'set-entrance') {
            State.setEntrance(value);
            Render.render();
            return;
          }

          if (action === 'set-scenario') {
            State.setScenario(value);
            Render.render();
            return;
          }

          if (action === 'set-region') {
            State.setRegion(value);
            Render.render();
            return;
          }

          if (action === 'set-okrug') {
            State.setOkrug(value);
            Render.render();
            return;
          }

          if (action === 'set-district') {
            State.setDistrict(value);
            Render.render();
            return;
          }

          if (action === 'toggle-param') {
            State.toggleParam(
              event.currentTarget.getAttribute('data-group'),
              value,
              event.currentTarget.getAttribute('data-mode')
            );
            Render.render();
            return;
          }

          if (action === 'go-page') {
            State.ui.currentPage = parseInt(value, 10);
            Render.render();
            return;
          }

          if (action === 'open-unit') {
            window.open(event.currentTarget.getAttribute('data-url'), '_blank');
            return;
          }

          if (action === 'reset') {
            State.clearAll();
            Render.render();
          }
        });
      });
    }
  };

  window.PSNHUB = {
    init: function(preset) {
      State.ui = createDefaultState();
      State.loadFromURL();

      var adaptedPreset = Selectors.adaptLegacyPreset(preset || window.PAGE_PRESET || null);
      if (!State.ui.entrance && adaptedPreset.entrance) State.ui.entrance = adaptedPreset.entrance;
      if (!State.ui.scenario && adaptedPreset.scenario) State.ui.scenario = adaptedPreset.scenario;
      if (!State.ui.geo.region && adaptedPreset.geo.region) State.ui.geo.region = adaptedPreset.geo.region;

      Loader.loadUnits().then(function(units) {
        State.rawUnits = units;
        State.units = units.map(function(unit) { return Mapper.mapUnit(unit); });
        Render.render();
      }).catch(function(error) {
        console.error('[DomRadar] init failed', error);
        var host = Render.mountRoot();
        host.innerHTML = '<div class="domradar-shell"><div class="domradar-empty"><div class="domradar-empty__title">Ошибка загрузки данных</div><div class="domradar-empty__text">Тестовая версия не смогла получить JSON из GitHub CDN.</div></div></div>';
      });
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    window.PSNHUB.init(window.PAGE_PRESET || null);
  });
})();
