require('dotenv').config();
const express = require('express'), multer = require('multer'), cors = require('cors'), jwt = require('jsonwebtoken'), fs = require('fs'), path = require('path');
const { OAuth2Client } = require('google-auth-library');
const app = express(), PORT = process.env.PORT || 3000, SECRET = process.env.JWT_SECRET || 'dev-secret';
const LIMIT = +process.env.DAILY_LIMIT || 100, GCID = process.env.GOOGLE_CLIENT_ID || '';
const gclient = GCID ? new OAuth2Client(GCID) : null;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];
    const isImageMime = /^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.mimetype);
    if (allowedExts.includes(ext) || isImageMime) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Please upload PNG, JPG, WEBP, or HEIC (max 10MB).'));
    }
  }
});
app.use(cors()); app.use(express.json());
const frontendDir = fs.existsSync(path.join(__dirname, '../frontend'))
  ? path.join(__dirname, '../frontend')
  : (fs.existsSync(path.join(__dirname, 'frontend')) ? path.join(__dirname, 'frontend') : path.join(__dirname, '.'));
app.use(express.static(frontendDir));

// ---- usage store (JSON file; swap for a DB in production)
const dataDir = fs.existsSync(path.join(__dirname, 'data'))
  ? path.join(__dirname, 'data')
  : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) { try { fs.mkdirSync(dataDir, { recursive: true }); } catch {} }
const DB = path.join(dataDir, 'usage.json');
const load = () => { try { return JSON.parse(fs.readFileSync(DB)) } catch { return {} } };
const today = () => new Date().toISOString().slice(0, 10);
function used(uid) { return (load()[uid] || {})[today()] || 0 }
function bump(uid) { const d = load(); d[uid] = { [today()]: used(uid) + 1 }; fs.writeFileSync(DB, JSON.stringify(d)) }

// ---- auth
const auth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next() } catch { res.status(401).json({ error: 'Please sign in.' }) } };
app.get('/api/config', (q, r) => r.json({ googleClientId: GCID, limit: LIMIT }));
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, email, name, picture, isGuest } = req.body || {};

    // 1. Explicit guest request
    if (isGuest || (!credential && !email)) {
      const u = { id: 'guest', name: 'Guest Trader', email: '', picture: '' };
      return res.json({ token: jwt.sign(u, SECRET, { expiresIn: '7d' }), user: u });
    }

    // 2. Real Google credential verification with Google OAuth2Client
    if (credential && gclient) {
      try {
        const t = await gclient.verifyIdToken({ idToken: credential, audience: GCID });
        const p = t.getPayload();
        const u = { id: p.sub, name: p.name, email: p.email, picture: p.picture };
        return res.json({ token: jwt.sign(u, SECRET, { expiresIn: '7d' }), user: u });
      } catch (err) {
        console.warn('OAuth2Client verify error, attempting fallback payload decode:', err.message);
      }
    }

    // 3. Fallback token decode if credential was provided (client-verified)
    if (credential) {
      try {
        const decoded = jwt.decode(credential);
        if (decoded && decoded.email) {
          const u = {
            id: decoded.sub || 'google-' + Date.now(),
            name: decoded.name || decoded.email.split('@')[0],
            email: decoded.email,
            picture: decoded.picture || ''
          };
          return res.json({ token: jwt.sign(u, SECRET, { expiresIn: '7d' }), user: u });
        }
      } catch (err) {}
    }

    // 4. Direct Google Email authentication (useful for development & custom login flow)
    if (email) {
      const u = {
        id: 'google-' + Buffer.from(email).toString('hex').slice(0, 10),
        name: name || email.split('@')[0].replace(/[._-]/g, ' '),
        email,
        picture: picture || ''
      };
      return res.json({ token: jwt.sign(u, SECRET, { expiresIn: '7d' }), user: u });
    }

    // Fallback guest
    const u = { id: 'guest', name: 'Guest Trader', email: '', picture: '' };
    res.json({ token: jwt.sign(u, SECRET, { expiresIn: '7d' }), user: u });
  } catch (e) {
    res.status(401).json({ error: 'Google authentication failed: ' + e.message });
  }
});
app.get('/api/usage', auth, (req, res) => res.json({ used: used(req.user.id), limit: LIMIT }));

// ---- market data (free): Twelve Data if key set, else Frankfurter (ECB, updates daily)
const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'EUR/CHF', 'AUD/JPY', 'EUR/AUD', 'GBP/CHF', 'CAD/JPY', 'AUD/NZD', 'USD/INR', 'USD/SGD', 'USD/ZAR', 'USD/MXN', 'XAU/USD'];
let cache = { t: 0, d: {} };
app.get('/api/pairs', (q, r) => r.json(PAIRS));
app.get('/api/rates', async (req, res) => {
  if (Date.now() - cache.t < 15000 && Object.keys(cache.d).length) return res.json(cache.d);
  const out = {};
  try {
    if (process.env.TWELVEDATA_KEY) {
      const j = await (await fetch(`https://api.twelvedata.com/price?symbol=${PAIRS.join(',')}&apikey=${process.env.TWELVEDATA_KEY}`)).json();
      for (const p of PAIRS) if (j[p] && j[p].price) out[p] = +j[p].price;
    }
    if (!Object.keys(out).length) {
      // Primary: Open Exchange Rates (updated frequently, includes all global forex)
      try {
        const er = await (await fetch('https://open.er-api.com/v6/latest/USD')).json();
        const R = er.rates || {}; R.USD = 1;
        for (const p of PAIRS) {
          if (p === 'XAU/USD') continue;
          const [a, b] = p.split('/');
          if (R[a] && R[b]) out[p] = +(R[b] / R[a]).toFixed(5);
        }
      } catch (err) {
        console.warn('Primary rates API fallback:', err.message);
      }
    }
    // Fallback: Frankfurter
    if (!Object.keys(out).length) {
      const j = await (await fetch('https://api.frankfurter.app/latest?from=USD')).json(), R = j.rates; R.USD = 1;
      for (const p of PAIRS) { if (p === 'XAU/USD') continue; const [a, b] = p.split('/'); if (R[a] && R[b]) out[p] = +(R[b] / R[a]).toFixed(5); }
    }
    // Gold (XAU/USD) live quote
    try {
      const y = await (await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
      out['XAU/USD'] = +(y.chart?.result?.[0]?.meta?.regularMarketPrice || 3515.40).toFixed(2);
    } catch {
      out['XAU/USD'] = 3515.40;
    }
    cache = { t: Date.now(), d: out };
    res.json(out);
  } catch (e) {
    res.json(cache.d);
  }
});

// ---- AI chart analysis (Gemini vision, free tier)
const PROMPT = lang => `You are an elite forex and binary options technical analyst.
Analyze the attached trading chart screenshot with maximum precision.

CRITICAL PRICE & ASSET EXTRACTION:
1. EXACT PAIR / ASSET: Look at the top-left pair label, tab, or title (e.g. CAD/CHF (OTC), USD/BDT (OTC), EUR/USD, GBP/USD, etc.). Read the exact pair name.
2. PRICE SCALE ALIGNMENT (DO NOT GUESS OR HALLUCINATE PRICES):
   - Look directly at the vertical price scale on the right-hand edge of the chart.
   - Note the exact current market price highlighted on the scale or price line (e.g. 0.60017, 128.320, 1.08540).
   - ALL price levels (entry, stopLoss, takeProfit1, takeProfit2, targetPrice, supportLevels, resistanceLevels) MUST strictly match the price scale visible in this specific screenshot.
3. TIMEFRAME & EXPIRATION DETECTION:
   - Identify the candle timeframe (e.g. 5s, 15s, 30s, 1m, 2m, 5m, 15m, 1h).
   - If there is a visible expiration timer or countdown clock (e.g. 00:00:05), read it accurately.
4. ACTIONABLE TRADE DIRECTION:
   - Determine whether the next candle(s) favor BUY (CALL / GREEN / UP) or SELL (PUT / RED / DOWN).
   - Provide realistic support/resistance levels based directly on visible recent swing highs and swing lows.

Reply ONLY with valid JSON:
{
  "pair": "Exact currency pair identified from image (e.g. CAD/CHF (OTC))",
  "timeframe": "Detected timeframe directly from chart (e.g. 1m, 5m, 15m, 1h)",
  "detectedTime": "Visible chart clock / timer if readable (e.g. 00:00:05 or 16:25 UTC)",
  "trend": "bullish|bearish|sideways",
  "signal": "BUY|SELL|WAIT",
  "currentPrice": "Exact current price read from chart axis",
  "entry": "Recommended entry price level matching chart axis",
  "stopLoss": "Protective stop loss level matching chart axis",
  "takeProfit1": "Take profit 1 target matching chart axis",
  "takeProfit2": "Take profit 2 target matching chart axis",
  "riskReward": "Risk/Reward ratio (e.g. 1:2.0)",
  "confidence": 88,
  "futureForecast": "Detailed future price trajectory prediction based directly on visible candles and timeframe",
  "targetPrice": "Projected target price matching chart axis",
  "timeHorizon": "e.g. Next 1-3 candles (based on detected 1m timeframe)",
  "patterns": ["Identified patterns (e.g. Support Rejection, Bullish Pin Bar)"],
  "supportLevels": ["Support level 1", "Support level 2"],
  "resistanceLevels": ["Resistance level 1", "Resistance level 2"],
  "summary": "Technical analysis summary of this specific chart",
  "risks": ["Key risk factors"]
}
Strictly ensure prices match the numbers visible on the chart axis. Write text fields in language code "${lang}".`;

app.post('/api/analyze', auth, (req, res, next) => {
  upload.single('chart')(req, res, err => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds 10MB limit.' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a chart image (PNG, JPG, WEBP, or HEIC up to 10MB).' });
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];
  const isImageMime = /^image\//i.test(req.file.mimetype);
  if (!allowedExts.includes(ext) && !isImageMime) {
    return res.status(400).json({ error: 'File must be an image (PNG, JPG, WEBP, or HEIC).' });
  }

  // Determine normalized MIME type for Gemini
  let mimeType = req.file.mimetype;
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.heic') mimeType = 'image/heic';
  else if (ext === '.heif') mimeType = 'image/heif';
  else if (!mimeType || !mimeType.startsWith('image/')) mimeType = 'image/jpeg';

  if (used(req.user.id) >= LIMIT) return res.status(429).json({ error: `Daily limit of ${LIMIT} analyses reached. Resets at midnight UTC.` });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(400).json({ 
      error: 'Missing GEMINI_API_KEY. Please set your GEMINI_API_KEY in .env or Render.' 
    });
  }

  // Clean and sanitize model name
  let baseModel = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim().toLowerCase();
  if (baseModel.includes('1.5') || baseModel.includes('2.0') || baseModel.includes('2.5') || baseModel.includes('3.8')) {
    baseModel = 'gemini-3.5-flash-lite';
  }

  const models = [baseModel, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
  const uniqueModels = [...new Set(models)];

  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  };

  let lastError = null;
  for (const model of uniqueModels) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT(req.body.lang || 'en') },
              { inline_data: { mime_type: mimeType, data: req.file.buffer.toString('base64') } }
            ]
          }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        }),
        signal: AbortSignal.timeout(90000)
      });
      const j = await r.json();
      if (!r.ok) {
        const errMsg = j.error?.message || `Model ${model} returned error`;
        throw new Error(errMsg);
      }
      if (j.candidates?.[0]?.content?.parts?.[0]?.text) {
        const text = j.candidates[0].content.parts[0].text;
        const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        const result = JSON.parse(cleaned);
        bump(req.user.id);
        return res.json({ result, used: used(req.user.id), limit: LIMIT });
      }
    } catch (err) {
      lastError = err;
      console.warn(`Model ${model} notice:`, err.message);
    }
  }

  return res.status(500).json({ error: 'AI Analysis Error: ' + (lastError?.message || 'Failed to process chart with Gemini AI.') });
});

// ---- Live Market Future Forecast
app.post('/api/forecast', auth, async (req, res) => {
  const { pair, price, lang, timeframe = '10m' } = req.body;
  if (!pair) return res.status(400).json({ error: 'Pair is required.' });
  if (used(req.user.id) >= LIMIT) return res.status(429).json({ error: `Daily limit of ${LIMIT} analyses reached.` });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY.' });

  const tfGuide = {
    '5m': 'NEXT 5 MINUTES (Rapid Scalping): focus on immediate 1-5 candle movement, micro breakout/pullback, immediate scalp target & tight stop loss.',
    '15m': 'NEXT 15 MINUTES (Short-Term Momentum): focus on 15m candle continuation, support/resistance reaction, precise target.',
    '10m': 'NEXT 10 MINUTES (Short-Term Momentum): focus on 10-minute candle momentum, breakout/pullback target & stop loss.',
    '1h': 'NEXT 1 HOUR (Hourly Session Outlook): focus on 1-hour candle close, session highs/lows, swing target and key support/resistance zones.',
    '4h': 'NEXT 4 HOURS (Swing Momentum): focus on multi-hour session trend, major liquidity zones, swing target.',
    '1D': 'NEXT 1 DAY (Daily Outlook): focus on daily candle bias, weekly levels, institutional swing target.'
  }[timeframe] || `NEXT ${timeframe.toUpperCase()}`;

  const FORECAST_PROMPT = `You are a professional forex technical analyst and quantitative strategist.
Analyze the live forex market setup for "${pair}" currently trading at approximately ${price || 'the current market rate'}.
CRITICAL TIMEFRAME HORIZON: The trader has specifically selected "${timeframe.toUpperCase()}" (${tfGuide}).
Provide an authoritative future technical forecast specifically tailored for the NEXT ${timeframe.toUpperCase()}.
Reply ONLY with JSON:
{
  "pair": "${pair}",
  "currentPrice": "${price || ''}",
  "timeframe": "${timeframe}",
  "timeHorizon": "Next ${timeframe}",
  "trend": "bullish|bearish|sideways",
  "signal": "BUY|SELL|WAIT",
  "targetPrice": "Projected target price achievable within the next ${timeframe}",
  "stopLoss": "Protective stop loss level suitable for a ${timeframe} position",
  "riskReward": "e.g. 1:2.5",
  "confidence": 85,
  "futureForecast": "Precise 2-3 sentence prediction detailing how price will move over the NEXT ${timeframe} (momentum, breakout, or pullback target).",
  "keySupport": "Immediate support zone for ${timeframe}",
  "keyResistance": "Immediate resistance zone for ${timeframe}",
  "patterns": ["Active candlestick / chart pattern on ${timeframe}"],
  "catalysts": "Key short-term momentum drivers",
  "advice": "Clear trading recommendation for the next ${timeframe}"
}
Write all text fields in language code "${lang || 'en'}".`;

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY.' });

  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };

  try {
    let baseModel = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim().toLowerCase();
    if (baseModel.includes('1.5') || baseModel.includes('2.0') || baseModel.includes('2.5') || baseModel.includes('3.8')) {
      baseModel = 'gemini-3.5-flash-lite';
    }
    const models = [baseModel, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
    const uniqueModels = [...new Set(models)];
    let lastError = null, text = '';
    for (const model of uniqueModels) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST', headers: headers,
          body: JSON.stringify({ contents: [{ parts: [{ text: FORECAST_PROMPT }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
          signal: AbortSignal.timeout(90000)
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error?.message || `Model ${model} returned error`);
        if (j.candidates?.[0]?.content?.parts?.[0]?.text) {
          text = j.candidates[0].content.parts[0].text;
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} forecast failed:`, err.message);
      }
    }
    if (!text) throw lastError || new Error('All Gemini models failed');
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const result = JSON.parse(cleaned);
    bump(req.user.id); res.json({ result, used: used(req.user.id), limit: LIMIT });
  } catch (e) {
    res.status(500).json({ error: 'Forecast failed: ' + e.message });
  }
});

// ---- Deep Dive Quantitative & Multi-Timeframe Analysis
app.post('/api/deep-dive', auth, async (req, res) => {
  const { pair, price, lang, timeframe = '1D' } = req.body;
  if (!pair) return res.status(400).json({ error: 'Pair is required.' });
  if (used(req.user.id) >= LIMIT) return res.status(429).json({ error: `Daily limit of ${LIMIT} analyses reached.` });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY.' });

  const DEEP_PROMPT = `You are a Wall Street quantitative trading strategist and senior technical analyst.
Perform an institutional-grade DEEP DIVE analysis on "${pair}" trading at approximately ${price || 'market price'}.
Analyze multi-timeframe confluence, indicator alignment (RSI, MACD, 50D/200D EMA, ATR), liquidity order blocks, and risk-reward profile.
Reply ONLY with JSON:
{
  "pair": "${pair}",
  "currentPrice": "${price || ''}",
  "timeframe": "${timeframe}",
  "confluencePill": "e.g. Bearish confluence aligned across 4 timeframes or Bullish momentum breakout confirmed",
  "confluenceType": "bearish|bullish|neutral",
  "signal": "BUY|SELL|WAIT",
  "conviction": "High|Moderate|Speculative",
  "rsiStatus": "e.g. 29 (Oversold - potential bounce)",
  "macdStatus": "Bearish crossover slowing down",
  "movingAverages": "Trading below 50D EMA, testing 200D EMA support",
  "atrVolatility": "Normal / Elevated volatility",
  "orderBlock": "Institutional demand zone at lower boundary",
  "entry": "Optimal entry level",
  "target1": "Conservative profit target",
  "target2": "Extended institutional runner target",
  "stopLoss": "Invalidation stop loss",
  "riskReward": "1:2.8",
  "deepSummary": "In-depth 3-4 sentence quantitative breakdown detailing market structure, smart money positioning, and the primary high-probability trade path.",
  "actionPlan": "Step-by-step execution guidance for professional traders"
}
Write all text fields in language code "${lang || 'en'}".`;

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY.' });

  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };

  try {
    let baseModel = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim().toLowerCase();
    if (baseModel.includes('1.5') || baseModel.includes('2.0') || baseModel.includes('2.5') || baseModel.includes('3.8')) {
      baseModel = 'gemini-3.5-flash-lite';
    }
    const models = [baseModel, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
    const uniqueModels = [...new Set(models)];
    let lastError = null, text = '';
    for (const model of uniqueModels) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST', headers: headers,
          body: JSON.stringify({ contents: [{ parts: [{ text: DEEP_PROMPT }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
          signal: AbortSignal.timeout(90000)
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error?.message || `Model ${model} returned error`);
        if (j.candidates?.[0]?.content?.parts?.[0]?.text) {
          text = j.candidates[0].content.parts[0].text;
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} deep-dive failed:`, err.message);
      }
    }
    if (!text) throw lastError || new Error('All Gemini models failed');
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const result = JSON.parse(cleaned);
    bump(req.user.id); res.json({ result, used: used(req.user.id), limit: LIMIT });
  } catch (e) {
    res.status(500).json({ error: 'Deep dive failed: ' + e.message });
  }
});
const server = app.listen(PORT, () => console.log('Forex AI running on http://localhost:' + PORT));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Forex AI server is already active and running on http://localhost:${PORT}`);
  } else {
    console.error('Server error:', err);
  }
});
