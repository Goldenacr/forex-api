const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function load(f) { try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} return {}; }
function save(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }

// Charts
const PAIRINGS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDCAD', 'NZDUSD', 'EURGBP'];
const BASE_PRICES = { 'EURUSD': 1.0850, 'GBPUSD': 1.2650, 'AUDUSD': 0.6580, 'USDJPY': 151.50, 'USDCAD': 1.3580, 'NZDUSD': 0.6050, 'EURGBP': 0.8570 };
const VOLATILITY = { 'EURUSD': 0.0003, 'GBPUSD': 0.0005, 'AUDUSD': 0.0004, 'USDJPY': 0.0300, 'USDCAD': 0.0004, 'NZDUSD': 0.0005, 'EURGBP': 0.0003 };

// Initialize charts
function initCharts() {
    const charts = load(path.join(DATA_DIR, 'charts.json'));
    for (const pair of PAIRINGS) {
        if (!charts[pair]) charts[pair] = { price: BASE_PRICES[pair], history: [], timestamp: Date.now() };
    }
    save(path.join(DATA_DIR, 'charts.json'), charts);
}
initCharts();

// Update charts every second
setInterval(() => {
    const charts = load(path.join(DATA_DIR, 'charts.json'));
    const fixed = load(path.join(DATA_DIR, 'fixed.json'));
    const now = Date.now();
    
    for (const pair of PAIRINGS) {
        let direction = 0;
        if (fixed[pair] && now < fixed[pair].until) {
            direction = fixed[pair].direction === 'UP' ? 1 : -1;
        }
        
        const vol = VOLATILITY[pair];
        let change = direction !== 0 ? (Math.random() < 0.7 ? direction : -direction) * vol : (Math.random() - 0.5) * vol * 2;
        charts[pair].price += change;
        charts[pair].price = Math.round(charts[pair].price * 100000) / 100000;
        charts[pair].timestamp = now;
        charts[pair].history = (charts[pair].history || []).slice(-100);
        charts[pair].history.push({ price: charts[pair].price, time: now });
    }
    
    save(path.join(DATA_DIR, 'charts.json'), charts);
}, 1000);

app.get('/charts', (req, res) => {
    res.json({ success: true, charts: load(path.join(DATA_DIR, 'charts.json')) });
});

app.post('/charts/fix', (req, res) => {
    const { pair, direction, until } = req.body;
    const fixed = load(path.join(DATA_DIR, 'fixed.json'));
    fixed[pair] = { direction, until, setAt: Date.now() };
    save(path.join(DATA_DIR, 'fixed.json'), fixed);
    res.json({ success: true });
});

// Traders
app.get('/traders', (req, res) => {
    res.json({ success: true, traders: load(path.join(DATA_DIR, 'traders.json')) });
});
app.post('/traders/sync', (req, res) => {
    const traders = load(path.join(DATA_DIR, 'traders.json'));
    if (req.body.trader) traders[req.body.trader.jid] = req.body.trader;
    save(path.join(DATA_DIR, 'traders.json'), traders);
    res.json({ success: true });
});

// Capital
app.get('/capital', (req, res) => {
    res.json({ success: true, capital: load(path.join(DATA_DIR, 'capital.json')) });
});
app.post('/capital/update', (req, res) => {
    const cap = load(path.join(DATA_DIR, 'capital.json'));
    cap.balance = (cap.balance || 5000) + (req.body.amount || 0);
    cap.totalPL = (cap.totalPL || 0) + (req.body.pl || 0);
    if (req.body.type === 'loss') cap.revenue = (cap.revenue || 0) + Math.abs(req.body.amount || 0);
    save(path.join(DATA_DIR, 'capital.json'), cap);
    res.json({ success: true });
});

// Loans
app.post('/loans/broadcast', (req, res) => {
    const loans = load(path.join(DATA_DIR, 'loans.json'));
    loans[req.body.loan.id] = req.body.loan;
    save(path.join(DATA_DIR, 'loans.json'), loans);
    res.json({ success: true });
});

// Deposits
app.post('/deposits/broadcast', (req, res) => {
    const deposits = load(path.join(DATA_DIR, 'deposits.json'));
    deposits[req.body.deposit.id] = req.body.deposit;
    save(path.join(DATA_DIR, 'deposits.json'), deposits);
    res.json({ success: true });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'forex-api', timestamp: Date.now() });
});

app.listen(PORT, () => console.log(`💱 Forex API running on port ${PORT}`));