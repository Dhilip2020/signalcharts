const $ = s => document.querySelector(s);
let token = localStorage.token;
let CFG = {};
let rates = {};
let prevRates = {};
let alerts = JSON.parse(localStorage.alerts || '[]');
let selectedTf = '1D';
let selectedInterval = 'D';
let lang = localStorage.lang || 'en';
let userProfile = JSON.parse(localStorage.userProfile || 'null');
let currentMarketFilter = 'all';
let currentMarketSearch = '';

function resolveEmbedSymbol(symbol, preferredTvSymbol) {
    const s = String(preferredTvSymbol || symbol || '').toUpperCase().trim();
    // Exchanges like S&P Global and Tadawul restrict raw cash index embedding on external sites.
    // We map them to their official TradingView-licensed CFD/ETF equivalents so charts render without errors.
    if (s === 'SP:SPX' || s === 'SPX' || s === 'S&P 500' || s === 'INDEX:SPX' || s === 'SP500') {
        return 'FOREXCOM:SPXUSD';
    }
    if (s === 'TADAWUL:TASI' || s === 'TASI' || s === 'TADAWUL') {
        return 'AMEX:KSA';
    }
    if (s === 'XAU/USD' || s === 'GOLD' || s === 'OANDA:XAUUSD') {
        return 'OANDA:XAUUSD';
    }
    if (s === 'AAPL' || s === 'NASDAQ:AAPL') return 'NASDAQ:AAPL';
    if (s === 'MSFT' || s === 'NASDAQ:MSFT') return 'NASDAQ:MSFT';
    if (s === 'NVDA' || s === 'NASDAQ:NVDA') return 'NASDAQ:NVDA';
    if (s.includes('/')) {
        const clean = s.replace('/', '');
        if (clean === 'USDINR') return 'FX_IDC:USDINR';
        return 'FX:' + clean;
    }
    return preferredTvSymbol || symbol;
}

// COMPLETE MASTER LIST OF 26 GLOBAL FOREX PAIRS, COMMODITIES & INDICES
const MASTER_MARKETS = [
    // MAJORS (7)
    { symbol: 'EUR/USD', name: 'Euro / US Dollar', group: 'majors', category: 'Major', flag: '🇪🇺', tvSymbol: 'FX:EURUSD', price: '1.09739', change: '+0.04%', delta: '+$0.0004', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '142B', ma50: '1.12', ma200: '1.08', rsi: '29', rsiStatus: 'Oversold', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'GBP/USD', name: 'British Pound / US Dollar', group: 'majors', category: 'Major', flag: '🇬🇧', tvSymbol: 'FX:GBPUSD', price: '1.30740', change: '+0.12%', delta: '+$0.0015', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '85B', ma50: '1.312', ma200: '1.295', rsi: '42', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', group: 'majors', category: 'Major', flag: '🇯🇵', tvSymbol: 'FX:USDJPY', price: '154.620', change: '-0.35%', delta: '-0.540', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '110B', ma50: '152.4', ma200: '148.8', rsi: '61', rsiStatus: 'Bullish', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', group: 'majors', category: 'Major', flag: '🇨🇭', tvSymbol: 'FX:USDCHF', price: '0.88450', change: '-0.08%', delta: '-0.0007', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '42B', ma50: '0.891', ma200: '0.882', rsi: '46', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', group: 'majors', category: 'Major', flag: '🇦🇺', tvSymbol: 'FX:AUDUSD', price: '0.65120', change: '+0.21%', delta: '+$0.0013', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '55B', ma50: '0.658', ma200: '0.662', rsi: '40', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', group: 'majors', category: 'Major', flag: '🇨🇦', tvSymbol: 'FX:USDCAD', price: '1.39850', change: '-0.15%', delta: '-0.0021', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '60B', ma50: '1.385', ma200: '1.371', rsi: '58', rsiStatus: 'Bullish', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'NZD/USD', name: 'New Zealand Dollar / US Dollar', group: 'majors', category: 'Major', flag: '🇳🇿', tvSymbol: 'FX:NZDUSD', price: '0.58940', change: '+0.18%', delta: '+$0.0010', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '28B', ma50: '0.596', ma200: '0.605', rsi: '38', rsiStatus: 'Weak', confluence: "Held inside yesterday's range", confluenceType: 'range' },

    // CROSSES (9)
    { symbol: 'EUR/GBP', name: 'Euro / British Pound', group: 'crosses', category: 'Cross', flag: '🇪🇺', tvSymbol: 'FX:EURGBP', price: '0.83920', change: '-0.06%', delta: '-0.0005', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '38B', ma50: '0.842', ma200: '0.848', rsi: '44', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen', group: 'crosses', category: 'Cross', flag: '🇪🇺', tvSymbol: 'FX:EURJPY', price: '169.650', change: '-0.28%', delta: '-0.470', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '45B', ma50: '168.1', ma200: '165.2', rsi: '55', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'GBP/JPY', name: 'British Pound / Japanese Yen', group: 'crosses', category: 'Cross', flag: '🇬🇧', tvSymbol: 'FX:GBPJPY', price: '202.150', change: '-0.20%', delta: '-0.400', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '52B', ma50: '199.8', ma200: '195.4', rsi: '57', rsiStatus: 'Bullish', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'EUR/CHF', name: 'Euro / Swiss Franc', group: 'crosses', category: 'Cross', flag: '🇪🇺', tvSymbol: 'FX:EURCHF', price: '0.97050', change: '-0.04%', delta: '-0.0004', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '22B', ma50: '0.975', ma200: '0.978', rsi: '43', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'AUD/JPY', name: 'Australian Dollar / Japanese Yen', group: 'crosses', category: 'Cross', flag: '🇦🇺', tvSymbol: 'FX:AUDJPY', price: '100.680', change: '-0.12%', delta: '-0.120', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '30B', ma50: '99.5', ma200: '98.2', rsi: '52', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'EUR/AUD', name: 'Euro / Australian Dollar', group: 'crosses', category: 'Cross', flag: '🇪🇺', tvSymbol: 'FX:EURAUD', price: '1.68520', change: '-0.14%', delta: '-0.0023', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '25B', ma50: '1.678', ma200: '1.665', rsi: '49', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'GBP/CHF', name: 'British Pound / Swiss Franc', group: 'crosses', category: 'Cross', flag: '🇬🇧', tvSymbol: 'FX:GBPCHF', price: '1.15650', change: '+0.03%', delta: '+$0.0003', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '18B', ma50: '1.152', ma200: '1.148', rsi: '51', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'CAD/JPY', name: 'Canadian Dollar / Japanese Yen', group: 'crosses', category: 'Cross', flag: '🇨🇦', tvSymbol: 'FX:CADJPY', price: '110.550', change: '-0.19%', delta: '-0.210', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '20B', ma50: '109.8', ma200: '108.4', rsi: '53', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'AUD/NZD', name: 'Australian / New Zealand Dollar', group: 'crosses', category: 'Cross', flag: '🇦🇺', tvSymbol: 'FX:AUDNZD', price: '1.10480', change: '+0.08%', delta: '+$0.0009', status: 'closed', reopen: 'reopens Mon 3:30 AM', avgVol: '16B', ma50: '1.098', ma200: '1.092', rsi: '56', rsiStatus: 'Bullish', confluence: "Held inside yesterday's range", confluenceType: 'range' },

    // EXOTICS (4)
    { symbol: 'USD/INR', name: 'US Dollar / Indian Rupee', group: 'exotics', category: 'Exotic', flag: '🇮🇳', tvSymbol: 'FX_IDC:USDINR', price: '84.450', change: '+0.05%', delta: '+₹0.04', status: 'closed', reopen: 'reopens Mon 9:00 AM IST', avgVol: '12B', ma50: '84.10', ma200: '83.60', rsi: '64', rsiStatus: 'Bullish', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'USD/SGD', name: 'US Dollar / Singapore Dollar', group: 'exotics', category: 'Exotic', flag: '🇸🇬', tvSymbol: 'FX:USDSGD', price: '1.34650', change: '-0.02%', delta: '-S$0.0003', status: 'closed', reopen: 'reopens Mon 8:00 AM SGT', avgVol: '15B', ma50: '1.341', ma200: '1.338', rsi: '48', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'USD/ZAR', name: 'US Dollar / South African Rand', group: 'exotics', category: 'Exotic', flag: '🇿🇦', tvSymbol: 'FX:USDZAR', price: '18.150', change: '-0.45%', delta: '-R0.08', status: 'closed', reopen: 'reopens Mon 8:00 AM SAST', avgVol: '8B', ma50: '17.90', ma200: '18.25', rsi: '47', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'USD/MXN', name: 'US Dollar / Mexican Peso', group: 'exotics', category: 'Exotic', flag: '🇲🇽', tvSymbol: 'FX:USDMXN', price: '20.420', change: '+0.32%', delta: '+$0.06', status: 'closed', reopen: 'reopens Mon 8:00 AM CST', avgVol: '22B', ma50: '19.85', ma200: '18.90', rsi: '62', rsiStatus: 'Bullish', confluence: "Held inside yesterday's range", confluenceType: 'range' },

    // COMMODITIES & INDICES (6)
    { symbol: 'XAU/USD', name: 'Gold / US Dollar', group: 'indices', category: 'Commodity', flag: '🥇', tvSymbol: 'OANDA:XAUUSD', price: '3,515.40', change: '+0.42%', delta: '+$14.70', status: 'closed', reopen: 'reopens Sun 6:00 PM EST', avgVol: '85K', ma50: '3,420', ma200: '3,180', rsi: '68', rsiStatus: 'Bullish', confluence: 'Bullish momentum breakout confirmed', confluenceType: 'bullish' },
    { symbol: 'S&P 500', name: 'S&P 500 Index', group: 'indices', category: 'Index', flag: '🇺🇸', tvSymbol: 'FOREXCOM:SPXUSD', price: '6,910.39', change: '-3.70%', delta: '-265.20', status: 'closed', reopen: 'reopens Mon 9:30 AM EST', avgVol: '2.8B', ma50: '6,980', ma200: '6,840', rsi: '38', rsiStatus: 'Weak', confluence: "Traded below yesterday's low", confluenceType: 'low' },
    { symbol: 'TASI', name: 'Tadawul All Share Index', group: 'indices', category: 'Index', flag: '🇸🇦', tvSymbol: 'AMEX:KSA', price: '9,960.44', change: '-1.95%', delta: '-197.80', status: 'closed', reopen: 'reopens Sun 10:00 AM', avgVol: '142M', ma50: '10,210', ma200: '10,480', rsi: '34', rsiStatus: 'Bearish', confluence: 'Bearish confluence aligned across 4 timeframes', confluenceType: 'bearish' },
    { symbol: 'AAPL', name: 'Apple Inc.', group: 'indices', category: 'Equities', flag: '🍏', tvSymbol: 'NASDAQ:AAPL', price: '342.56', change: '-1.90%', delta: '-$6.63', status: 'closed', reopen: 'reopens Mon 9:30 AM EST', avgVol: '48M', ma50: '348.10', ma200: '335.20', rsi: '44', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', group: 'indices', category: 'Equities', flag: '🪟', tvSymbol: 'NASDAQ:MSFT', price: '484.52', change: '-2.77%', delta: '-$13.80', status: 'closed', reopen: 'reopens Mon 9:30 AM EST', avgVol: '21M', ma50: '492.00', ma200: '468.50', rsi: '42', rsiStatus: 'Neutral', confluence: "Held inside yesterday's range", confluenceType: 'range' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', group: 'indices', category: 'Equities', flag: '🟢', tvSymbol: 'NASDAQ:NVDA', price: '125.53', change: '-14.01%', delta: '-$20.45', status: 'closed', reopen: 'reopens Mon 9:30 AM EST', avgVol: '115M', ma50: '138.40', ma200: '122.10', rsi: '31', rsiStatus: 'Oversold', confluence: "Held inside yesterday's range", confluenceType: 'range' }
];

let currentAsset = MASTER_MARKETS[0]; // Default to EUR/USD

const NEWS_DATABASE = {
    General: [
        {
            title: 'Top Wall Street analysts favor these 3 dividend stocks for strong returns',
            desc: "Wall Street analysts can help shortlist attractive dividend-paying stocks, as their recommendations are backed by thorough analysis of a company's balance sheet, recurring cash flow and capital allocation.",
            source: 'CNBC',
            time: '52m ago',
            thumbText: 'DIVIDEND'
        },
        {
            title: 'Anthropic mathematician claims to have proved Riemann hypothesis with help of Claude - The Independent',
            desc: 'Anthropic mathematician claims to have proved Riemann hypothesis with help of Claude The Independent The AI Riemann hypothesis proof is true, independent verification from peer institutions underway.',
            source: 'news.google',
            time: '1h ago',
            thumbText: 'AI MATH'
        },
        {
            title: 'EXCLUSIVE: Like SpaceX, Anthropic ran an unusual IPO process, chafing some bankers - Reuters',
            desc: "EXCLUSIVE: Like SpaceX, Anthropic ran an unusual IPO process, chafing some bankers Reuters Anthropic's IPO Turmoil Caps $4 Trillion AI Wipeout on Wall Street as late-stage secondary rounds close.",
            source: 'news.google',
            time: '1h ago',
            thumbText: 'REUTERS'
        },
        {
            title: 'Copper Prices Are Plunging and Sending a Warning for the US Economy - Business Insider',
            desc: 'Copper Prices Are Plunging and Sending a Warning for the US Economy Business Insider From Squeezes to Meltdown, a Week of Mayhem Rocks Metals across London and Chicago exchanges.',
            source: 'news.google',
            time: '2h ago',
            thumbText: 'METALS'
        },
        {
            title: 'Looking for the Formula to Stop an Apocalypse - The New York Times',
            desc: 'Looking for the Formula to Stop an Apocalypse The New York Times exploration of quantitative algorithmic risk hedges and macro tail-risk protection funds.',
            source: 'news.google',
            time: '2h ago',
            thumbText: 'MACRO'
        }
    ],
    Crypto: [
        {
            title: 'Bitcoin Consolidates Near Key $90K Zone as Institutional Inflows Re-Accelerate',
            desc: 'Spot ETF volume surges with sustained institutional net inflows as major asset managers allocate dry powder into digital gold reserves.',
            source: 'Bloomberg Crypto',
            time: '24m ago',
            thumbText: 'BITCOIN'
        },
        {
            title: 'Ethereum Layer-2 Network Activity Surpasses 100M Daily Transactions',
            desc: 'Scalability rollups see parabolic volume growth driven by decentralized finance liquidity pools and institutional tokenized treasury bills.',
            source: 'CoinDesk',
            time: '1h ago',
            thumbText: 'ETHEREUM'
        }
    ],
    Currencies: [
        {
            title: 'Federal Reserve & ECB Monetary Policy Divergence Dominates Forex Flow',
            desc: 'Global currency volatility remains elevated as institutional FX desks position ahead of upcoming CPI prints and central bank rate guidance.',
            source: 'Reuters FX',
            time: '18m ago',
            thumbText: 'EUR/USD'
        },
        {
            title: 'US Dollar Index (DXY) Defends Key 104.20 Structural Support',
            desc: 'Treasury yield stabilization provides bid support for the greenback against G10 majors while Japanese Yen intervention watch remains active.',
            source: 'ForexLive',
            time: '45m ago',
            thumbText: 'USD/DXY'
        }
    ],
    Tadawul: [
        {
            title: 'Tadawul All Share Index (TASI) Tests Key 9,960 Structural Support',
            desc: 'Saudi equity benchmark consolidates as corporate earnings across banking and utilities sectors establish steady institutional liquidity cushions.',
            source: 'Argaam',
            time: '40m ago',
            thumbText: 'TADAWUL'
        },
        {
            title: 'Aramco & PIF Infrastructure Partnerships Expand Across Renewable Energy',
            desc: 'Major industrial joint ventures inject substantial domestic capital expenditure into listed industrial equities on the Saudi Exchange.',
            source: 'Arab News',
            time: '2h ago',
            thumbText: 'ARAMCO'
        }
    ],
    MENA: [
        {
            title: 'GCC Financial Markets Lead Regional Growth on Non-Oil Sector Boom',
            desc: 'Record corporate bond issuance and international investor inflows highlight resilience across UAE, Saudi, and Qatar capital markets.',
            source: 'Zawya',
            time: '1h ago',
            thumbText: 'GCC'
        },
        {
            title: 'Dubai Financial Market Advances on Strong Real Estate & Fintech Gains',
            desc: 'Foreign institutional trading desks recorded net positive flows exceeding AED 480M across prime commercial and financial constituents.',
            source: 'Gulf News',
            time: '3h ago',
            thumbText: 'DFM'
        }
    ]
};

const followedAssets = new Set();

const api = (u, o = {}) => fetch(u, {
    ...o,
    headers: { ...(o.headers || {}), Authorization: 'Bearer ' + token }
}).then(async r => {
    const j = await r.json();
    if (!r.ok) throw Error(j.error || 'Error');
    return j;
});

window.initGoogleAuth = function() {
    const gbtn = $('#gbtn');
    const customGBtn = $('#custom-google-btn');
    const noClientNotice = $('#no-client-notice');

    if (CFG.googleClientId && window.google?.accounts?.id && gbtn) {
        try {
            google.accounts.id.initialize({
                client_id: CFG.googleClientId,
                callback: r => login({ credential: r.credential }),
                auto_select: false,
                cancel_on_tap_outside: false,
                use_fedcm_for_prompt: false
            });
            google.accounts.id.renderButton(gbtn, {
                theme: 'filled_black',
                size: 'large',
                width: 320,
                text: 'continue_with',
                shape: 'pill',
                logo_alignment: 'left'
            });
            // Hide fallback button, show official GSI button
            if (customGBtn) customGBtn.style.display = 'none';
            if (noClientNotice) noClientNotice.style.display = 'none';
            // Enable One Tap
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    if (customGBtn) customGBtn.style.display = 'none';
                }
            });
        } catch (e) {
            console.warn('Google GSI render notice:', e);
        }
    } else if (!CFG.googleClientId) {
        // Show custom button, hide GSI container
        if (customGBtn) customGBtn.style.display = 'flex';
        if (gbtn) gbtn.style.display = 'none';
        if (noClientNotice) noClientNotice.style.display = 'flex';
    }
};

async function init() {
    setupNavigation();
    setupCollapse();
    setupMarketTimeframes();
    setupMarketFilters();
    setupNewsTabs();
    updateProfileUI();
    renderPopularMarkets();
    renderNews('General');

    const guestBtn = $('#guest');
    if (guestBtn) {
        guestBtn.onclick = (e) => {
            e.preventDefault();
            login({ isGuest: true });
        };
    }

    try {
        CFG = await (await fetch('/api/config')).json();
    } catch {}

    window.initGoogleAuth();
    let retries = 0;
    const gCheck = setInterval(() => {
        if (window.google?.accounts?.id || ++retries > 10) {
            clearInterval(gCheck);
            window.initGoogleAuth();
        }
    }, 500);

    const customGBtn = $('#custom-google-btn');
    if (customGBtn) {
        customGBtn.onclick = async () => {
            if (CFG.googleClientId && window.google?.accounts?.id) {
                google.accounts.id.prompt();
                return;
            }
            const email = prompt('Enter your Google email address to sign in (or set GOOGLE_CLIENT_ID in .env):', userProfile?.email || 'trader@gmail.com');
            if (!email || !email.includes('@')) return;
            const name = email.split('@')[0].replace(/[._-]/g, ' ');
            await login({ email, name });
        };
    }

    if (token) {
        try {
            await showApp();
            return;
        } catch (e) {
            console.warn('Auto showApp error:', e);
        }
    }
}

async function login(b) {
    try {
        const r = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(b)
        });
        const j = await r.json();
        if (!r.ok) return alert(j.error || 'Login failed');
        token = localStorage.token = j.token;
        if (j.user && j.user.id !== 'guest') {
            userProfile = j.user;
            localStorage.userProfile = JSON.stringify(j.user);
        } else {
            userProfile = null;
            localStorage.removeItem('userProfile');
        }
        updateProfileUI();
        await showApp();
    } catch (err) {
        alert('Authentication error: ' + err.message);
    }
}

function updateProfileUI() {
    const nameEl = $('#user-display-name');
    const emailEl = $('#user-display-email');
    const avatarEl = $('#user-avatar');

    // Strict privacy rule: Never show personal email for guest trader
    if (!userProfile || userProfile.id === 'guest' || !userProfile.email) {
        if (nameEl) nameEl.textContent = 'Guest Trader';
        if (emailEl) emailEl.textContent = 'Free Plan (100 / day)';
        if (avatarEl) avatarEl.textContent = 'GT';
        return;
    }

    if (nameEl) nameEl.textContent = userProfile.name || 'Trader';
    if (emailEl) emailEl.textContent = userProfile.email;
    if (avatarEl) {
        const initials = (userProfile.name || 'TR').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        avatarEl.textContent = initials || 'TR';
    }
}

async function showApp() {
    const loginModal = $('#login');
    const appEl = $('#app');
    if (loginModal) {
        loginModal.hidden = true;
        loginModal.style.setProperty('display', 'none', 'important');
    }
    if (appEl) {
        appEl.hidden = false;
        appEl.style.display = 'block';
    }
    try {
        await usage();
    } catch (e) {}
    loadRates();
    setInterval(pollRates, 20000);
}

async function usage() {
    try {
        const u = await api('/api/usage');
        const badge = $('#usage-badge');
        if (badge) badge.textContent = `${u.used} of ${u.limit} used`;
    } catch {}
}

function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(btn => {
        btn.onclick = () => {
            const targetId = btn.dataset.tab;
            switchToTab(targetId);
        };
    });

    // Clicking "Back to Markets" in the detail view returns to the all pairs grid!
    const marketBackBtn = $('#market-back-btn');
    if (marketBackBtn) {
        marketBackBtn.onclick = (e) => {
            e.preventDefault();
            showMarketsList();
        };
    }

    const allNewsBtn = $('#btn-all-news');
    if (allNewsBtn) {
        allNewsBtn.onclick = () => switchToTab('news');
    }
}

function switchToTab(tabId) {
    document.querySelectorAll('.tab-pane, .nav-link').forEach(e => e.classList.remove('on'));
    const targetLink = document.querySelector(`.nav-link[data-tab="${tabId}"]`);
    if (targetLink) targetLink.classList.add('on');
    const targetSection = $('#' + tabId);
    if (targetSection) targetSection.classList.add('on');

    const breadcrumbEl = $('#breadcrumb-current');
    if (breadcrumbEl && targetLink) {
        const label = targetLink.querySelector('span');
        if (label) breadcrumbEl.textContent = label.textContent;
    }

    if (tabId === 'today') {
        renderPopularMarkets();
    } else if (tabId === 'markets') {
        showMarketsList();
    } else if (tabId === 'news') {
        renderNews('General');
    } else if (tabId === 'watchlist') {
        renderWatchlist();
    }
}

function setupCollapse() {
    const collapseBtn = $('#collapse-btn');
    const sidebar = $('#sidebar');
    if (collapseBtn && sidebar) {
        collapseBtn.onclick = () => sidebar.classList.toggle('collapsed');
    }
}

/* ==========================================================================
   MARKETS TAB: LIST VIEW & DETAIL VIEW SWITCHER
   ========================================================================== */
function showMarketsList() {
    const listV = $('#markets-list-view');
    const detailV = $('#markets-detail-view');
    if (listV) listV.style.display = 'block';
    if (detailV) detailV.style.display = 'none';
    renderAllMarketsGrid(currentMarketFilter, currentMarketSearch);
}

function openMarketDetail(asset) {
    currentAsset = asset;
    const listV = $('#markets-list-view');
    const detailV = $('#markets-detail-view');
    if (listV) listV.style.display = 'none';
    if (detailV) detailV.style.display = 'block';
    renderMarketDetail(asset);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupMarketFilters() {
    document.querySelectorAll('#market-cat-filters .mkt-cat-pill').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#market-cat-filters .mkt-cat-pill').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            currentMarketFilter = btn.dataset.cat || 'all';
            renderAllMarketsGrid(currentMarketFilter, currentMarketSearch);
        };
    });

    const searchInput = $('#market-search-input');
    if (searchInput) {
        searchInput.oninput = (e) => {
            currentMarketSearch = e.target.value;
            renderAllMarketsGrid(currentMarketFilter, currentMarketSearch);
        };
    }
}

function renderAllMarketsGrid(filterCat = currentMarketFilter, query = currentMarketSearch) {
    currentMarketFilter = filterCat;
    currentMarketSearch = (query || '').toLowerCase().trim();
    const container = $('#all-markets-cards');
    if (!container) return;

    // Sync live prices from rates cache
    MASTER_MARKETS.forEach(m => {
        if (rates[m.symbol]) {
            m.price = formatPrice(m.symbol, rates[m.symbol]);
        }
    });

    const filtered = MASTER_MARKETS.filter(item => {
        const matchesCat = (filterCat === 'all' || item.group === filterCat);
        const matchesQuery = !currentMarketSearch || 
            item.symbol.toLowerCase().includes(currentMarketSearch) || 
            item.name.toLowerCase().includes(currentMarketSearch);
        return matchesCat && matchesQuery;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--text-muted);">
                <p style="font-size: 16px; font-weight: 700; margin-bottom: 6px; color: #cbd5e1;">No forex pairs found matching "${esc(query)}"</p>
                <p style="font-size: 13px;">Try searching for EUR, GBP, JPY, CAD, Gold, or INR</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const isDown = (item.change || '').startsWith('-');
        return `
            <div class="forex-pair-card" data-sym="${item.symbol}">
                <div class="fpc-top">
                    <div class="fpc-left">
                        <div class="fpc-flag">${item.flag}</div>
                        <div class="fpc-symbol-block">
                            <span class="fpc-sym">${item.symbol}</span>
                            <span class="fpc-name">${item.name}</span>
                        </div>
                    </div>
                    <span class="fpc-badge ${item.group}">${item.category}</span>
                </div>
                <div class="fpc-price-row">
                    <span class="fpc-price">${item.price}</span>
                    <span class="fpc-change ${isDown ? 'down' : 'up'}">${item.change}</span>
                </div>
                <div class="fpc-footer">
                    <span>Open Candlestick Chart</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.forex-pair-card').forEach(card => {
        card.onclick = () => {
            const sym = card.dataset.sym;
            const asset = MASTER_MARKETS.find(a => a.symbol === sym) || currentAsset;
            openMarketDetail(asset);
        };
    });
}

/* ==========================================================================
   TODAY TAB: POPULAR MARKETS (MATCHING IMAGE 1)
   ========================================================================== */
function renderPopularMarkets() {
    const container = $('#popular-markets-list');
    if (!container) return;

    // Filter top popular items from MASTER_MARKETS
    const popularSymbols = ['TASI', 'S&P 500', 'AAPL', 'MSFT', 'NVDA', 'EUR/USD', 'XAU/USD'];
    const popularItems = popularSymbols.map(s => MASTER_MARKETS.find(m => m.symbol === s)).filter(Boolean);

    popularItems.forEach(m => {
        if (rates[m.symbol]) {
            m.price = formatPrice(m.symbol, rates[m.symbol]);
        }
    });

    container.innerHTML = popularItems.map(item => {
        const isFollowed = followedAssets.has(item.symbol);
        const isDown = (item.change || '').startsWith('-');
        return `
            <div class="popular-market-row" data-symbol="${item.symbol}">
                <div class="pm-identity">
                    <div class="pm-icon-wrap">${item.flag}</div>
                    <div class="pm-meta">
                        <span class="pm-symbol">${item.symbol}</span>
                        <span class="pm-name">${item.name}</span>
                    </div>
                </div>

                <div class="pm-confluence-col">
                    <span class="confluence-pill ${item.confluenceType}">${item.confluence}</span>
                </div>

                <div class="pm-financials">
                    <div class="pm-price-block">
                        <span class="pm-price">${item.price}</span>
                        <span class="pm-change ${isDown ? 'down' : 'up'}">${item.change}</span>
                    </div>
                    <button class="pm-follow-btn" data-sym="${item.symbol}" onclick="event.stopPropagation(); toggleFollow('${item.symbol}')">
                        ${isFollowed ? '✓ Following' : '+ Follow'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.popular-market-row').forEach(row => {
        row.onclick = () => {
            const sym = row.dataset.symbol;
            const asset = MASTER_MARKETS.find(a => a.symbol === sym) || currentAsset;
            switchToTab('markets');
            openMarketDetail(asset);
        };
    });

    // Preview news on Today tab
    const previewContainer = $('#today-news-preview');
    if (previewContainer) {
        const topNews = NEWS_DATABASE.General.slice(0, 2);
        previewContainer.innerHTML = topNews.map(n => `
            <div class="news-feed-card" onclick="switchToTab('news')">
                <div class="news-thumb">${n.thumbText}</div>
                <div class="news-card-content">
                    <h4 class="news-card-title">${n.title}</h4>
                    <p class="news-card-desc">${n.desc}</p>
                    <div class="news-card-meta">
                        <span>${n.source} · ${n.time}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

function toggleFollow(symbol) {
    if (followedAssets.has(symbol)) {
        followedAssets.delete(symbol);
    } else {
        followedAssets.add(symbol);
    }
    renderPopularMarkets();
}

/* ==========================================================================
   NEWS & INSIGHTS TAB (MATCHING IMAGE 2)
   ========================================================================== */
function setupNewsTabs() {
    document.querySelectorAll('.news-cat-pill').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.news-cat-pill').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            const cat = btn.dataset.cat || 'General';
            renderNews(cat);
        };
    });
}

function renderNews(category) {
    const list = $('#news-feed-list');
    if (!list) return;
    const items = NEWS_DATABASE[category] || NEWS_DATABASE.General;

    list.innerHTML = items.map(item => `
        <div class="news-feed-card">
            <div class="news-thumb">${item.thumbText}</div>
            <div class="news-card-content">
                <h4 class="news-card-title">${item.title}</h4>
                <p class="news-card-desc">${item.desc}</p>
                <div class="news-card-meta">
                    <span>${item.source} · ${item.time}</span>
                    <svg class="news-open-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </div>
            </div>
        </div>
    `).join('');
}

/* ==========================================================================
   MARKETS DETAIL VIEW (MATCHING IMAGE 3)
   ========================================================================== */
function renderMarketDetail(asset) {
    currentAsset = asset;
    const flagEl = $('#market-flag-circle');
    const titleEl = $('#market-full-title');
    const catEl = $('#market-category-badge');
    const subTickerEl = $('#market-sub-ticker');
    const priceEl = $('#market-big-price');
    const deltaEl = $('#market-price-delta');
    const closeMetaEl = $('#chart-close-meta');
    const reopenNoticeEl = $('#market-reopen-notice');

    if (flagEl) flagEl.innerHTML = `<span style="font-size:24px;">${asset.flag}</span>`;
    if (titleEl) titleEl.textContent = `${asset.name} (${asset.symbol})`;
    if (catEl) catEl.textContent = asset.category || 'Currencies';
    if (subTickerEl) subTickerEl.textContent = asset.symbol;

    const formattedPrice = typeof asset.price === 'number' ? formatPrice(asset.symbol, asset.price) : (asset.price.startsWith('$') ? asset.price : '$' + asset.price);
    if (priceEl) priceEl.textContent = formattedPrice;

    if (deltaEl) {
        const isDown = (asset.change || '').startsWith('-');
        deltaEl.className = `asset-price-delta ${isDown ? 'down' : 'up'}`;
        deltaEl.textContent = `${asset.delta || '-0.0000'} (${asset.change || '-0.00%'})`;
    }

    if (closeMetaEl) {
        closeMetaEl.textContent = `${selectedTf} close ${formattedPrice.replace('$', '')} ${asset.change || '-0.00%'}`;
    }

    if (reopenNoticeEl) {
        reopenNoticeEl.innerHTML = `<span class="dot-warn">●</span> Market closed · ${asset.reopen || 'reopens Mon 3:30 AM'}`;
    }

    // Indicator cards below chart
    const avgVolEl = $('#ind-avg-vol');
    const ma50El = $('#ind-50-ma');
    const ma200El = $('#ind-200-ma');
    const rsiValEl = $('#ind-rsi-val');
    const rsiBadgeEl = $('#ind-rsi-badge');

    if (avgVolEl) avgVolEl.textContent = asset.avgVol || '0';
    if (ma50El) ma50El.textContent = asset.ma50 || '1.12';
    if (ma200El) ma200El.textContent = asset.ma200 || '1.08';
    if (rsiValEl) rsiValEl.textContent = asset.rsi || '29';
    if (rsiBadgeEl) {
        rsiBadgeEl.textContent = asset.rsiStatus || 'Oversold';
        rsiBadgeEl.className = `rsi-badge ${+asset.rsi < 35 ? 'oversold' : ''}`;
    }

    // Render TradingView Chart iframe
    const container = $('#tv');
    if (container) {
        const tvSym = resolveEmbedSymbol(asset.symbol, asset.tvSymbol);
        container.innerHTML = `<iframe style="width:100%;height:100%;border:none;" src="https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tvSym)}&interval=${selectedInterval}&theme=dark&style=1&timezone=Etc%2FUTC&studies=[%22RSI@tv-basicstudies%22,%22MASimple@tv-basicstudies%22]&hideideas=1" frameborder="0" allowtransparency="true" scrolling="no"></iframe>`;
    }

    // Reset intelligence box to initial aesthetic state if not already populated
    const intelBox = $('#market-intelligence-box');
    if (intelBox && !intelBox.dataset.hasResult) {
        intelBox.innerHTML = `
            <div class="intelligence-empty-state">
                <div class="sparkle-circle-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/></svg>
                </div>
                <h4 class="empty-sub-heading">Click the button above to generate a data driven analysis using live market indicators.</h4>
                <p class="empty-fine-print">Analysis is based on live indicator data (RSI, MACD, EMA, ATR) and calculated support/resistance levels.</p>
            </div>
        `;
    }
}

function setupMarketTimeframes() {
    document.querySelectorAll('#market-timeframes .tf-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#market-timeframes .tf-btn').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            selectedTf = btn.dataset.tf;
            selectedInterval = btn.dataset.interval || 'D';

            const tfLabel = $('#gen-tf-label');
            if (tfLabel) tfLabel.textContent = selectedTf;

            renderMarketDetail(currentAsset);
        };
    });

    // Generate Analysis (1D) click handler
    const genBtn = $('#btn-generate-analysis');
    if (genBtn) {
        genBtn.onclick = async () => {
            const out = $('#market-intelligence-box');
            if (!out) return;
            out.dataset.hasResult = 'true';
            out.innerHTML = `
                <div class="intelligence-empty-state">
                    <div class="sparkle-circle-icon" style="color:#00d084;border-color:#00d084;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="animation:spin 1.5s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    </div>
                    <h4 class="empty-sub-heading" style="color:#ffffff;">Generating Institutional Analysis (${selectedTf})…</h4>
                    <p class="empty-fine-print">Calculating multi-timeframe confluence, order block zones & projected targets…</p>
                </div>
            `;
            try {
                const { result: r } = await api('/api/forecast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pair: currentAsset.symbol, price: currentAsset.price, lang, timeframe: selectedTf })
                });
                usage();
                renderIntelligenceResult(r, selectedTf);
            } catch (err) {
                out.innerHTML = `<div class="intelligence-empty-state"><p class="err">${err.message}</p></div>`;
            }
        };
    }

    // Deep Dive Analysis click handler
    const deepDiveBtn = $('#btn-deep-dive');
    if (deepDiveBtn) {
        deepDiveBtn.onclick = async () => {
            const out = $('#market-intelligence-box');
            if (!out) return;
            out.dataset.hasResult = 'true';
            out.innerHTML = `
                <div class="intelligence-empty-state">
                    <div class="sparkle-circle-icon" style="color:#4f46e5;border-color:#4f46e5;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="animation:spin 1.5s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                    </div>
                    <h4 class="empty-sub-heading" style="color:#ffffff;">Running Wall Street Deep Dive…</h4>
                    <p class="empty-fine-print">Auditing RSI/MACD divergence, 50D/200D MA structure & smart money order blocks…</p>
                </div>
            `;
            try {
                const { result: r } = await api('/api/deep-dive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pair: currentAsset.symbol, price: currentAsset.price, lang, timeframe: selectedTf })
                });
                usage();
                renderDeepDiveResult(r);
            } catch (err) {
                out.innerHTML = `<div class="intelligence-empty-state"><p class="err">${err.message}</p></div>`;
            }
        };
    }

    // Create smart alert button
    const createAlertBtn = $('#btn-create-alert');
    if (createAlertBtn) {
        createAlertBtn.onclick = () => {
            switchToTab('alerts');
            const pairSelect = $('#apair');
            if (pairSelect) pairSelect.value = currentAsset.symbol;
        };
    }
}

function renderIntelligenceResult(r, tf) {
    const out = $('#market-intelligence-box');
    if (!out) return;
    out.innerHTML = `
        <div class="analysis-result-view">
            <div class="result-hero-bar">
                <div>
                    <h3 style="font-size:16px;margin-bottom:2px;">${esc(r.pair)}</h3>
                    <div class="result-meta-title" style="font-size:13px;">Horizon: <b style="color:#60a5fa;">${esc(tf)}</b> · <span style="text-transform:capitalize;">${esc(r.trend)}</span></div>
                </div>
                <div class="result-sig-pill ${esc(r.signal)}" style="font-size:14px;padding:4px 12px;">${esc(r.signal)}</div>
            </div>

            <div class="forecast-card-highlight">
                <h4>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Projected Target (${esc(tf)})
                </h4>
                <div style="font-size:18px;font-weight:800;color:#00d084;margin-bottom:6px;">${esc(r.targetPrice)}</div>
                <p style="font-size:12px;line-height:1.5;color:var(--text-secondary);">${esc(r.futureForecast)}</p>
            </div>

            <div class="metrics-row-grid">
                <div class="metric-item"><small>Support</small><span>${esc(r.keySupport || 'N/A')}</span></div>
                <div class="metric-item"><small>Resistance</small><span>${esc(r.keyResistance || 'N/A')}</span></div>
                <div class="metric-item"><small>Stop Loss</small><span style="color:#f87171;">${esc(r.stopLoss || 'N/A')}</span></div>
            </div>

            <p style="font-size:12px;line-height:1.5;color:var(--text-muted);margin:0;">
                <b>Trade Guidance:</b> ${esc(r.advice || '')} ${r.catalysts ? ' · ' + esc(r.catalysts) : ''}
            </p>
        </div>
    `;
}

function renderDeepDiveResult(r) {
    const out = $('#market-intelligence-box');
    if (!out) return;
    out.innerHTML = `
        <div class="analysis-result-view">
            <div class="result-hero-bar">
                <div>
                    <h3 style="font-size:16px;margin-bottom:2px;">${esc(r.pair)}</h3>
                    <div class="result-meta-title" style="font-size:13px;">Conviction: <b style="color:#00d084;">${esc(r.conviction || 'High')}</b></div>
                </div>
                <div class="result-sig-pill ${esc(r.signal)}" style="font-size:14px;padding:4px 12px;">${esc(r.signal)}</div>
            </div>

            <div style="margin-bottom:6px;">
                <span class="confluence-pill ${esc(r.confluenceType || 'bearish')}">${esc(r.confluencePill || 'Confluence aligned across 4 timeframes')}</span>
            </div>

            <p style="font-size:12px;line-height:1.6;color:var(--text-secondary);background:rgba(0,0,0,0.25);padding:10px;border-radius:8px;">
                ${esc(r.deepSummary)}
            </p>

            <div class="metrics-row-grid">
                <div class="metric-item"><small>RSI Status</small><span style="font-size:12px;">${esc(r.rsiStatus || '29 (Oversold)')}</span></div>
                <div class="metric-item"><small>Target 1</small><span style="color:#00d084;">${esc(r.target1 || 'N/A')}</span></div>
                <div class="metric-item"><small>Target 2</small><span style="color:#00d084;">${esc(r.target2 || 'N/A')}</span></div>
                <div class="metric-item"><small>Stop Loss</small><span style="color:#f87171;">${esc(r.stopLoss || 'N/A')}</span></div>
            </div>

            <div style="font-size:11px;color:var(--text-muted);line-height:1.5;">
                <p><b>Order Block:</b> ${esc(r.orderBlock || 'N/A')}</p>
                <p><b>Execution Plan:</b> ${esc(r.actionPlan || '')}</p>
            </div>
        </div>
    `;
}

/* ==========================================================================
   AI CHART ANALYSIS (TAB 1)
   ========================================================================== */
let file = null;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];

async function setFile(f) {
    if (!f) return;
    const out = $('#out');
    const p = $('#preview');

    if (f.size > MAX_BYTES) {
        out.innerHTML = `<div class="empty-state"><p class="err">File size exceeds 10MB limit (${(f.size / (1024 * 1024)).toFixed(1)}MB). Please upload under 10MB.</p></div>`;
        file = null;
        if (p) p.style.display = 'none';
        return;
    }

    const ext = (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    const isImage = ALLOWED_EXTS.includes(ext) || /^image\/(png|jpe?g|webp|heic|heif)/i.test(f.type);
    if (!isImage) {
        out.innerHTML = `<div class="empty-state"><p class="err">Unsupported format. Supported: PNG, JPG, WEBP, HEIC (max 10MB).</p></div>`;
        file = null;
        if (p) p.style.display = 'none';
        return;
    }

    if ((ext === '.heic' || ext === '.heif' || f.type.includes('heic') || f.type.includes('heif')) && window.heic2any) {
        try {
            out.innerHTML = `<div class="empty-state"><p>Processing HEIC preview…</p></div>`;
            const blob = await heic2any({ blob: f, toType: 'image/jpeg', quality: 0.9 });
            const convertedBlob = Array.isArray(blob) ? blob[0] : blob;
            file = new File([convertedBlob], f.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
            if (p) {
                p.src = URL.createObjectURL(convertedBlob);
                p.style.display = 'block';
            }
            out.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon-circle"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg></div>
                    <h3 class="empty-title">Ready for Analysis</h3>
                    <p class="empty-sub">Click "Analyze chart" below to generate AI technical intelligence</p>
                </div>`;
            return;
        } catch (err) {}
    }

    file = f;
    if (p) {
        p.src = URL.createObjectURL(f);
        p.style.display = 'block';
    }
    out.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon-circle"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg></div>
            <h3 class="empty-title">Ready for Analysis</h3>
            <p class="empty-sub">Click "Analyze chart" below to generate AI technical intelligence</p>
        </div>`;
}

const fileInput = $('#file');
if (fileInput) fileInput.onchange = e => setFile(e.target.files[0]);

const dropZone = $('#drop');
if (dropZone) {
    ['dragover', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => {
        e.preventDefault();
        if (ev === 'drop' && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    }));
}

document.addEventListener('paste', e => {
    const f = [...e.clipboardData.files][0];
    if (f) setFile(f);
});

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const goBtn = $('#go');
if (goBtn) {
    goBtn.onclick = async () => {
        const out = $('#out');
        if (!file) {
            out.innerHTML = `<div class="empty-state"><p class="err">Please select or drop a chart screenshot first.</p></div>`;
            return;
        }

        out.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon-circle" style="color:#60a5fa;border-color:#3b82f6;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="animation:spin 1.5s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                </div>
                <h3 class="empty-title" style="color:#f8fafc;">Scanning Chart Intelligence…</h3>
                <p class="empty-sub">Extracting chart interval, order flow & calculating future trajectory…</p>
            </div>`;

        const fd = new FormData();
        fd.append('lang', lang);
        fd.append('chart', file);

        try {
            const { result: r } = await api('/api/analyze', { method: 'POST', body: fd });
            usage();

            out.innerHTML = `
                <div class="analysis-result-view">
                    <div class="result-hero-bar">
                        <div>
                            <h3 style="font-size:18px;margin-bottom:4px;">${esc(r.pair || 'Forex Setup')}</h3>
                            <div class="result-meta-title">
                                Timeframe: <b style="color:var(--accent-blue);">${esc(r.timeframe || 'Chart')}</b>
                                ${r.detectedTime ? '&nbsp;·&nbsp; Time: <b>' + esc(r.detectedTime) + '</b>' : ''}
                                &nbsp;·&nbsp; <span style="text-transform:capitalize;">${esc(r.trend)}</span>
                            </div>
                        </div>
                        <div class="result-sig-pill ${esc(r.signal)}">${esc(r.signal)}</div>
                    </div>

                    <div class="forecast-card-highlight">
                        <h4>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            Future Trajectory & Target (${esc(r.timeframe || 'Detected')})
                        </h4>
                        <p style="font-size:14px;margin-bottom:8px;">
                            <b>Projected Target:</b> <span style="color:var(--accent-green);font-size:16px;font-weight:800;">${esc(r.targetPrice || r.takeProfit1 || 'N/A')}</span>
                            &nbsp;|&nbsp; <b>Horizon:</b> ${esc(r.timeHorizon || ('Next ' + (r.timeframe || 'chart') + ' candles'))}
                        </p>
                        <p style="font-size:13px;line-height:1.6;color:var(--text-secondary);background:rgba(0,0,0,0.25);padding:10px;border-radius:8px;">
                            ${esc(r.futureForecast || r.summary)}
                        </p>
                    </div>

                    <div class="metrics-row-grid">
                        <div class="metric-item"><small>Entry</small><span>${esc(r.entry)}</span></div>
                        <div class="metric-item"><small>Stop Loss</small><span style="color:var(--accent-red);">${esc(r.stopLoss)}</span></div>
                        <div class="metric-item"><small>Target 1</small><span style="color:var(--accent-green);">${esc(r.takeProfit1)}</span></div>
                        <div class="metric-item"><small>Target 2</small><span style="color:var(--accent-green);">${esc(r.takeProfit2)}</span></div>
                        <div class="metric-item"><small>R / R</small><span>${esc(r.riskReward)}</span></div>
                    </div>

                    <div>
                        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px;">
                            <span>AI Confidence</span>
                            <b>${+r.confidence || 0}%</b>
                        </div>
                        <div class="confidence-bar-wrap"><i style="width:${+r.confidence || 0}%"></i></div>
                    </div>

                    <div style="font-size:13px;line-height:1.6;">
                        <p style="margin-bottom:6px;"><b>Patterns:</b> ${(r.patterns || []).map(esc).join(', ') || 'N/A'}</p>
                        <p style="margin-bottom:6px;"><b>Support:</b> ${(r.supportLevels || []).map(esc).join(', ') || 'N/A'} &nbsp;|&nbsp; <b>Resistance:</b> ${(r.resistanceLevels || []).map(esc).join(', ') || 'N/A'}</p>
                        <p style="color:var(--text-muted);font-size:12px;"><b>Analysis:</b> ${esc(r.summary)}</p>
                        ${(r.risks && r.risks.length) ? `<p class="err" style="font-size:12px;">${r.risks.map(esc).join(' • ')}</p>` : ''}
                    </div>
                </div>`;
        } catch (e) {
            out.innerHTML = `<div class="empty-state"><p class="err">${esc(e.message)}</p></div>`;
        }
    };
}

/* ==========================================================================
   RATES & WATCHLIST & ALERTS
   ========================================================================== */
const formatPrice = (p, val) => {
    if (typeof val !== 'number' || isNaN(val)) return '—';
    if (p === 'XAU/USD') return '$' + val.toFixed(2);
    if (p.includes('JPY')) return val.toFixed(3);
    return val.toFixed(5);
};

async function loadRates() {
    try {
        const p = await (await fetch('/api/pairs')).json();
        const apairSelect = $('#apair');
        if (apairSelect) apairSelect.innerHTML = p.map(x => `<option>${x}</option>`).join('');
    } catch {}
    await pollRates();
}

async function pollRates() {
    try {
        const newRates = await (await fetch('/api/rates')).json();
        prevRates = rates;
        rates = newRates;
        if (rates[currentAsset.symbol]) {
            currentAsset.price = rates[currentAsset.symbol];
            const pEl = $('#market-big-price');
            if (pEl) pEl.textContent = formatPrice(currentAsset.symbol, currentAsset.price);
        }
        // Update live markets grid if visible
        const listV = $('#markets-list-view');
        if (listV && listV.style.display !== 'none') {
            renderAllMarketsGrid(currentMarketFilter, currentMarketSearch);
        }
    } catch (e) {}
    checkAlerts();
}

function renderWatchlist() {
    const container = $('#watchlist-cards');
    if (!container) return;
    const popular = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AUD/USD', 'USD/INR'];
    container.innerHTML = popular.map(p => {
        const val = rates[p] || (p === 'EUR/USD' ? 1.0968 : 1.2840);
        return `
            <div class="chartick-card" style="cursor:pointer;" onclick="selectWatchlistItem('${p}')">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-size:16px;">${p}</h3>
                    <span class="badge-live" style="font-size:10px;">WATCHING</span>
                </div>
                <div style="font-size:22px;font-weight:800;margin:10px 0 4px 0;">${formatPrice(p, val)}</div>
                <div style="font-size:12px;color:var(--text-muted);">Click to open live institutional chart & analysis</div>
            </div>`;
    }).join('');
}

function selectWatchlistItem(p) {
    const found = MASTER_MARKETS.find(a => a.symbol === p);
    switchToTab('markets');
    if (found) {
        openMarketDetail(found);
    } else {
        openMarketDetail({
            symbol: p,
            name: p.replace('/', ' / '),
            group: 'majors',
            category: 'Currencies',
            flag: p.includes('EUR') ? '🇪🇺' : (p.includes('GBP') ? '🇬🇧' : (p.includes('JPY') ? '🇯🇵' : '🇺🇸')),
            tvSymbol: 'FX:' + p.replace('/', ''),
            price: rates[p] || 1.0,
            change: '-0.00%',
            delta: '$-0.0000',
            status: 'closed',
            reopen: 'reopens Mon 3:30 AM',
            avgVol: '0',
            ma50: '1.12',
            ma200: '1.08',
            rsi: '45',
            rsiStatus: 'Neutral'
        });
    }
}

function drawAlerts() {
    localStorage.alerts = JSON.stringify(alerts);
    const listEl = $('#alist');
    if (listEl) {
        listEl.innerHTML = alerts.map((a, i) => `
            <li>
                <span><b>${esc(a.pair)}</b> ${a.dir} ${a.level}</span>
                <button class="secondary-btn" style="padding:4px 10px;font-size:12px;" onclick="alerts.splice(${i},1);drawAlerts()">Remove</button>
            </li>`).join('');
    }
}

const addAlertBtn = $('#aadd');
if (addAlertBtn) {
    addAlertBtn.onclick = () => {
        const level = +$('#alevel').value;
        if (!level) return;
        alerts.push({ pair: $('#apair').value, dir: $('#adir').value, level });
        drawAlerts();
        $('#alevel').value = '';
    };
}

function checkAlerts() {
    alerts = alerts.filter(a => {
        const p = rates[a.pair];
        if (p == null) return true;
        if (a.dir === 'above' ? p >= a.level : p <= a.level) {
            const m = `${a.pair} is ${a.dir} ${a.level} (now ${p.toFixed(5)})`;
            if (window.Notification && Notification.permission === 'granted') {
                new Notification('SignalCharts Alert', { body: m });
            } else {
                alert(m);
            }
            return false;
        }
        return true;
    });
    drawAlerts();
}

const notifBtn = $('#notif');
if (notifBtn) notifBtn.onclick = () => window.Notification && Notification.requestPermission();

const langSelect = $('#lang');
if (langSelect) {
    langSelect.onchange = e => {
        lang = localStorage.lang = e.target.value;
    };
}

const logoutBtn = $('#logout');
if (logoutBtn) {
    logoutBtn.onclick = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userProfile');
        location.reload();
    };
}

init();
drawAlerts();
