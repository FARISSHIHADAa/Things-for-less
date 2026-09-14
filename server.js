const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory data structures (Will reset if server sleeps. Use a database like MongoDB Atlas Free tier later if needed)
let items = [
    { name: "Vintage Watch", limit: 3, currentBids: 0 },
    { name: "Leather Jacket", limit: 1, currentBids: 0 }
];

let bids = [];

// --- PUBLIC API FOR GOOGLE SITES FRONTEND ---

// Get active items
app.get('/api/items', (req, res) => {
    res.json(items);
});

// Submit a new bid
app.post('/api/bids', (req, res) => {
    const { name, item, amount } = req.body;
    
    const targetItem = items.find(i => i.name === item);
    if (!targetItem) return res.status(404).json({ error: "Item not found" });
    if (targetItem.currentBids >= targetItem.limit) {
        return res.status(400).json({ error: "This item has hit its bid limit!" });
    }

    const newBid = {
        id: Date.now(),
        name,
        item,
        amount,
        status: 'pending' // pending, accepted, declined, maybe
    };

    bids.push(newBid);
    targetItem.currentBids++;
    res.status(201).json(newBid);
});


// --- ADMIN BACKEND DASHBOARD (PANEL HTML) ---

app.get('/admin', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Admin Dashboard</title>
        <style>
            body { font-family: sans-serif; margin: 30px; background: #f4f4f9; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; background: white;}
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #333; color: white; }
            .btn { padding: 5px 10px; cursor:pointer; border:none; color:white; border-radius:3px;}
            .accept { background: green; } .decline { background: red; } .maybe { background: orange; }
            .section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px;}
        </style>
    </head>
    <body>
        <h1>Auction Backend Panel</h1>
        
        <div class="section">
            <h2>Add / Manage Items</h2>
            <form action="/admin/add-item" method="POST">
                <input type="text" name="name" placeholder="Item Name" required>
                <input type="number" name="limit" placeholder="Max Allowable Bids" required min="1">
                <button type="submit">Add Item</button>
            </form>
            <h3>Current Items</h3>
            <ul>
                ${items.map(i => `<li>${i.name} (Limit: ${i.limit}, Received: ${i.currentBids}) <a href="/admin/delete-item?name=${encodeURIComponent(i.name)}">[Remove]</a></li>`).join('')}
            </ul>
        </div>

        <div class="section">
            <h2>Incoming Bids (Review Panel)</h2>
            <table>
                <tr>
                    <th>Bidder Name</th>
                    <th>Item Ordered</th>
                    <th>Amount Offerd</th>
                    <th>Current Status</th>
                    <th>Actions</th>
                </tr>
                ${bids.map(b => `
                <tr>
                    <td>${b.name}</td>
                    <td>${b.item}</td>
                    <td>$${b.amount}</td>
                    <td><strong>${b.status.toUpperCase()}</strong></td>
                    <td>
                        <button class="btn accept" onclick="updateStatus(${b.id}, 'accepted')">Accept</button>
                        <button class="btn decline" onclick="updateStatus(${b.id}, 'declined')">Decline</button>
                        <button class="btn maybe" onclick="updateStatus(${b.id}, 'maybe')">Maybe</button>
                    </td>
                </tr>`).join('')}
            </table>
        </div>

        <div class="section">
            <h2>Compare Leaderboard (Highest Bids)</h2>
            <table>
                <tr>
                    <th>Item</th>
                    <th>Highest Bidder</th>
                    <th>Highest Offer</th>
                </tr>
                ${items.map(i => {
                    const itemBids = bids.filter(b => b.item === i.name);
                    const highestBid = itemBids.length ? itemBids.reduce((max, b) => b.amount > max.amount ? b : max, itemBids[0]) : null;
                    return `
                    <tr>
                        <td>${i.name}</td>
                        <td>${highestBid ? highestBid.name : 'No bids yet'}</td>
                        <td>${highestBid ? '$' + highestBid.amount : '-'}</td>
                    </tr>`;
                }).join('')}
            </table>
        </div>

        <script>
            async function updateStatus(id, status) {
                await fetch('/admin/update-bid', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ id, status })
                });
                location.reload();
            }
        </script>
    </body>
    </html>
    `);
});

// Admin endpoints for form actions
app.post('/admin/add-item', (req, res) => {
    const { name, limit } = req.body;
    // Basic body parser handling fallback if urlencoded isn't explicitly used
    // For standard form posts, we add dynamic handling:
    let itemName = req.body.name;
    let itemLimit = parseInt(req.body.limit);

    if(!itemName) {
        // Fallback parse if standard URL encoding is used instead of JSON
        return res.redirect('/admin'); 
    }
    
    items.push({ name: itemName, limit: itemLimit, currentBids: 0 });
    res.redirect('/admin');
});

// Allow application/x-www-form-urlencoded parsing for native HTML forms
app.use(express.urlencoded({ extended: true }));
app.post('/admin/add-item', (req, res) => {
    items.push({ name: req.body.name, limit: parseInt(req.body.limit), currentBids: 0 });
    res.redirect('/admin');
});

app.get('/admin/delete-item', (req, res) => {
    items = items.filter(i => i.name !== req.query.name);
    res.redirect('/admin');
});

app.post('/admin/update-bid', (req, res) => {
    const { id, status } = req.body;
    const bid = bids.find(b => b.id === id);
    if (bid) bid.status = status;
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
