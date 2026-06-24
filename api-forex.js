const express = require('express');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const MONGO_URI = 'mongodb+srv://richvybs18:Fuckyou2026%24@cluster0.cq4ddne.mongodb.net/?appName=Cluster0';
const DB_NAME = 'forex';
let db;

async function connectDB() {
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log('✅ MongoDB Connected - Forex API');
        
        // Wait a moment to ensure collections are accessible, then initialize charts
        await initCharts();
    } catch (e) {
        console.error('MongoDB connection error:', e.message);
    }
}
connectDB();

function tradersCol() { return db?.collection('traders'); }
function chartsCol() { return db?.collection('charts'); }
function positionsCol() { return db?.collection('positions'); }
function capitalCol() { return db?.collection('capital'); }
function loansCol() { return db?.collection('loans'); }
function depositsCol() { return db?.collection('deposits'); }
function fixedCol() { return db?.collection('fixed'); }

// ======================== CHARTS ========================
const PAIRINGS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDCAD', 'NZDUSD', 'EURGBP'];
const BASE_PRICES = { 'EURUSD': 1.0850, 'GBPUSD': 1.2650, 'AUDUSD': 0.6580, 'USDJPY': 151.50, 'USDCAD': 1.3580, 'NZDUSD': 0.6050, 'EURGBP': 0.8570 };
const VOLATILITY = { 'EURUSD': 0.0003, 'GBPUSD': 0.0005, 'AUDUSD': 0.0004, 'USDJPY': 0.0300, 'USDCAD': 0.0004, 'NZDUSD': 0.0005, 'EURGBP': 0.0003 };

async function initCharts() {
    try {
        const col = chartsCol();
        if (!col) {
            console.error('❌ Charts collection not available');
            return;
        }
        
        console.log('🔄 Initializing charts...');
        let created = 0;
        let existing = 0;
        
        for (const pair of PAIRINGS) {
            const exists = await col.findOne({ pair });
            if (!exists) {
                const newChart = {
                    pair,
                    price: BASE_PRICES[pair],
                    history: [{
                        price: BASE_PRICES[pair],
                        time: Date.now()
                    }],
                    timestamp: Date.now()
                };
                await col.insertOne(newChart);
                created++;
                console.log(`✅ Created chart for ${pair} at price ${BASE_PRICES[pair]}`);
            } else {
                existing++;
            }
        }
        console.log(`📊 Charts initialized: ${created} created, ${existing} already existed`);
    } catch (e) {
        console.error('❌ Error initializing charts:', e.message);
    }
}

setInterval(async () => {
    try {
        const col = chartsCol();
        const fixedColRef = fixedCol();
        if (!col) return;
        
        // Check if charts exist, if not initialize them
        const chartCount = await col.countDocuments();
        if (chartCount === 0) {
            console.log('⚠️ No charts found, reinitializing...');
            await initCharts();
            return;
        }
        
        for (const pair of PAIRINGS) {
            const chart = await col.findOne({ pair });
            if (!chart) continue;
            
            let direction = 0;
            const fixed = fixedColRef ? await fixedColRef.findOne({ pair }) : null;
            if (fixed && Date.now() < fixed.until) {
                direction = fixed.direction === 'UP' ? 1 : -1;
            }
            
            const vol = VOLATILITY[pair];
            let change = direction !== 0 ? (Math.random() < 0.7 ? direction : -direction) * vol : (Math.random() - 0.5) * vol * 2;
            chart.price += change;
            chart.price = Math.round(chart.price * 100000) / 100000;
            chart.timestamp = Date.now();
            chart.history = (chart.history || []).slice(-99);
            chart.history.push({ price: chart.price, time: Date.now() });
            
            await col.updateOne({ pair }, { $set: chart });
        }
        
        // Clean expired fixes
        if (fixedColRef) await fixedColRef.deleteMany({ until: { $lt: Date.now() } });
    } catch (e) {
        console.error('Error in price update interval:', e.message);
    }
}, 1000);

app.get('/charts', async (req, res) => {
    try {
        const col = chartsCol();
        if (!col) return res.json({ success: true, charts: {} });
        const charts = await col.find({}).toArray();
        const result = {};
        charts.forEach(c => { result[c.pair] = { price: c.price, history: c.history, timestamp: c.timestamp }; });
        res.json({ success: true, charts: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/charts/fix', async (req, res) => {
    try {
        const { pair, direction, until } = req.body;
        const col = fixedCol();
        if (col) await col.updateOne({ pair }, { $set: { pair, direction, until, setAt: Date.now() } }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ======================== TRADERS ========================
app.get('/traders', async (req, res) => {
    try {
        const col = tradersCol();
        if (!col) return res.json({ success: true, traders: {} });
        const traders = await col.find({}).toArray();
        const result = {};
        traders.forEach(t => { result[t.jid] = t; delete result[t.jid]._id; });
        res.json({ success: true, traders: result, total: traders.length });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/traders/sync', async (req, res) => {
    try {
        const { trader, botId } = req.body;
        if (!trader?.jid) return res.status(400).json({ success: false });
        trader.botId = botId;
        trader.syncedAt = Date.now();
        const col = tradersCol();
        if (col) await col.updateOne({ jid: trader.jid }, { $set: trader }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ======================== CAPITAL ========================
app.get('/capital', async (req, res) => {
    try {
        const col = capitalCol();
        if (!col) return res.json({ success: true, capital: { balance: 5000 } });
        const cap = await col.findOne({ type: 'main' }) || { balance: 5000, totalGiven: 0, totalPL: 0, revenue: 0 };
        delete cap._id;
        res.json({ success: true, capital: cap });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/capital/update', async (req, res) => {
    try {
        const { amount, pl, type } = req.body;
        const col = capitalCol();
        if (!col) return res.json({ success: true });
        const cap = await col.findOne({ type: 'main' }) || { balance: 5000, totalGiven: 0, totalPL: 0, revenue: 0 };
        cap.balance = (cap.balance || 5000) + (amount || 0);
        cap.totalPL = (cap.totalPL || 0) + (pl || 0);
        if (type === 'loss') cap.revenue = (cap.revenue || 0) + Math.abs(amount || 0);
        await col.updateOne({ type: 'main' }, { $set: cap }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ======================== POSITIONS ========================
app.get('/positions', async (req, res) => {
    try {
        const col = positionsCol();
        if (!col) return res.json({ success: true, positions: {} });
        const positions = await col.find({}).toArray();
        const result = {};
        positions.forEach(p => { result[p.id] = p; delete result[p.id]._id; });
        res.json({ success: true, positions: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/positions/sync', async (req, res) => {
    try {
        const { position, botId } = req.body;
        if (!position?.id) return res.status(400).json({ success: false });
        position.botId = botId;
        const col = positionsCol();
        if (col) await col.updateOne({ id: position.id }, { $set: position }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/positions/update', async (req, res) => {
    try {
        const { positionId, updates } = req.body;
        const col = positionsCol();
        if (col) await col.updateOne({ id: positionId }, { $set: updates });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ======================== LOANS & DEPOSITS ========================
app.get('/loans', async (req, res) => {
    try {
        const col = loansCol();
        if (!col) return res.json({ success: true, loans: {} });
        const loans = await col.find({}).toArray();
        const result = {};
        loans.forEach(l => { result[l.id] = l; delete result[l.id]._id; });
        res.json({ success: true, loans: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/loans/broadcast', async (req, res) => {
    try {
        const { loan, botId } = req.body;
        if (!loan?.id) return res.status(400).json({ success: false });
        loan.botId = botId;
        const col = loansCol();
        if (col) await col.updateOne({ id: loan.id }, { $set: loan }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/deposits', async (req, res) => {
    try {
        const col = depositsCol();
        if (!col) return res.json({ success: true, deposits: {} });
        const deposits = await col.find({}).toArray();
        const result = {};
        deposits.forEach(d => { result[d.id] = d; delete result[d.id]._id; });
        res.json({ success: true, deposits: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/deposits/broadcast', async (req, res) => {
    try {
        const { deposit, botId } = req.body;
        if (!deposit?.id) return res.status(400).json({ success: false });
        deposit.botId = botId;
        const col = depositsCol();
        if (col) await col.updateOne({ id: deposit.id }, { $set: deposit }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ======================== HEALTH ========================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'forex-api', db: !!db, timestamp: Date.now() });
});

// Initialize charts on startup is now handled in connectDB()
app.listen(PORT, () => console.log(`💱 Forex API running on port ${PORT}`));
