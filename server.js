const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

// Essential middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Path definitions for local storage files
const DATA_DIR = path.join(__dirname, 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const BIDS_FILE = path.join(DATA_DIR, 'bids.json');

// Ensure data folder and storage files exist on startup
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(ITEMS_FILE)) fs.writeFileSync(ITEMS_FILE, JSON.stringify([{ name: "Farus", limit: 4, currentBids: 0 }]));
if (!fs.existsSync(BIDS_FILE)) fs.writeFileSync(BIDS_FILE, JSON.stringify([]));

// Helper functions to read and write records safely
function getItems() { return JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8')); }
function saveItems(data) { fs.writeFileSync(ITEMS_FILE, JSON.stringify(data, null, 2)); }
function getBids() { return JSON.parse(fs.readFileSync(BIDS_FILE, 'utf8')); }
function saveBids(data) { fs.writeFileSync(BIDS_FILE, JSON.stringify(data, null, 2)); }

// --- PUBLIC API FOR GOOGLE SITES FRONTEND ---

// Get active items
app.get('/api/items', (req, res) => {
    try {
        res.json(getItems());
    } catch (err) {
        res.status(500).json({ error: "Failed to read database records" });
    }
});

// Submit a new bid
app.post('/api/bids', (req, res) => {
    try {
        const { name, item, amount, quantity } = req.body;
        let localItems = getItems();
        let localBids = getBids();
        
        const targetItem = localItems.find(i => i.name === item);
        if (!targetItem) return res.status(404).json({ error: "Item not found" });
        
        const requestedQty = parseInt(quantity) || 1;
        const bidAmount = parseFloat(amount) || 0;

        if ((targetItem.currentBids + requestedQty) > targetItem.limit) {
            const slotsLeft = targetItem.limit - targetItem.currentBids;
            return res.status(400).json({ error: `Not enough items left! Only ${slotsLeft} item(s) remaining.` });
        }

        const newBid = {
            id: Date.now(),
            name: name ? name.trim() : "Anonymous",
            item,
            quantity: requestedQty,
            amount: bidAmount,
            totalOffer: bidAmount * requestedQty,
            status: 'pending' 
        };

        localBids.push(newBid);
        targetItem.currentBids += requestedQty;
        
        saveItems(localItems);
        saveBids(localBids);
        
        res.status(201).json(newBid);
    } catch (err) {
        res.status(500).json({ error: "Server processing error" });
    }
});


// --- ADMIN BACKEND DASHBOARD ---

app.get('/admin', (req, res) => {
    const localItems = getItems();
    const localBids = getBids();

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Admin Dashboard</title>
        <style>
            body { font-family: sans-serif; margin: 30px; background: #f4f4f9; color: #333;}
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; background: white;}
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #008CBA; color: white; }
            .btn { padding: 6px 12px; cursor:pointer; border:none; color:white; border-radius:3px; font-weight: bold;}
            .accept { background: #28a745; } .decline { background: #dc3545; } .maybe { background: #ffc107; color: black; }
            .section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px;}
            input[type="text"], input[type="number"] { padding: 8px; width: 200px; margin-right: 10px; border: 1px solid #ccc; border-radius: 4px; }
            button[type="submit"] { padding: 8px 15px; background: #008CBA; color: white; border: none; border-radius: 4px; cursor: pointer; }
            .remove-link { color: #dc3545; text-decoration: none; font-weight: bold; margin-left: 10px;}
        </style>
    </head>
    <body>
        <h1>Auction Backend Panel</h1>
        
        <div class="section">
            <h2>Add / Manage Items</h2>
            <form action="/admin/add-item" method="POST">
                <input type="text" name="itemName" placeholder="Item Name" required>
                <input type="number" name="itemLimit" placeholder="Max Quantity Available" required min="1">
                <button type="submit">Add Item</button>
            </form>
            <h3>Current Items Available</h3>
            <ul>
                ${localItems.map(i => `
                    <li>
                        <strong>${i.name}</strong> (Total Limit: ${i.limit}, Reserved/Taken: ${i.currentBids}) 
                        <a class="remove-link" href="/admin/delete-item?name=${encodeURIComponent(i.name)}">[Remove]</a>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="section">
            <h2>Incoming Bids (Review Panel)</h2>
            <table>
                <tr>
                    <th>Bidder Name</th>
                    <th>Item Ordered</th>
                    <th>Qty Wanted</th>
                    <th>Bid Per Item</th>
                    <th>Total Offer Value</th>
                    <th>Current Status</th>
                    <th>Actions</th>
                </tr>
                ${localBids.map(b => `
                <tr>
                    <td>${b.name}</td>
                    <td>${b.item}</td>
                    <td>${b.quantity}</td>
                    <td>$${Number(b.amount).toFixed(2)}</td>
                    <td>$${Number(b.totalOffer).toFixed(2)}</td>
                    <td><strong>${b.status.toUpperCase()}</strong></td>
                    <td>
                        <button class="btn accept" onclick="updateStatus(${b.id}, 'accepted')">Accept</button>
                        <button class="btn maybe" onclick="updateStatus(${b.id}, 'maybe')">Maybe</button>
                        <button class="btn decline" onclick="deleteBid(${b.id})">Decline (Delete)</button>
                    </td>
                </tr>`).join('')}
            </table>
        </div>

        <div class="section">
            <h2>Compare Leaderboard (Highest Bids Per Item)</h2>
            <table>
                <tr>
                    <th>Item</th>
                    <th>Highest Bidder</th>
                    <th>Highest Single Bid Offer</th>
                </tr>
                ${localItems.map(i => {
                    const itemBids = localBids.filter(b => b.item === i.name);
                    let highestBid = null;
                    
                    if (itemBids.length > 0) {
                        highestBid = itemBids.reduce((max, b) => (b.amount > max.amount ? b : max), itemBids[0]);
                    }
                    
                    return `
                    <tr>
                        <td>${i.name}</td>
                        <td>${highestBid ? highestBid.name : 'No bids yet'}</td>
                        <td>${highestBid ? '$' + Number(highestBid.amount).toFixed(2) : '-'}</td>
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

            async function deleteBid(id) {
                if(confirm("Are you sure you want to decline and permanently delete this bid?")) {
                    await fetch('/admin/delete-bid', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ id })
                    });
                    location.reload();
                }
            }
        </script>
    </body>
    </html>
    `);
});

// Route for adding items
app.post('/admin/add-item', (req, res) => {
    let localItems = getItems();
    const name = req.body.itemName;
    const limit = parseInt(req.body.itemLimit);

    if (name && !isNaN(limit)) {
        localItems.push({ name: name.trim(), limit: limit, currentBids: 0 });
        saveItems(localItems);
    }
    res.redirect('/admin');
});

// Route for deleting items
app.get('/admin/delete-item', (req, res) => {
    const itemName = req.query.name;
    let localItems = getItems().filter(i => i.name !== itemName);
    let localBids = getBids().filter(b => b.item !== itemName);
    
    saveItems(localItems);
    saveBids(localBids);
    res.redirect('/admin');
});

// Route for updating bid statuses
app.post('/admin/update-bid', (req, res) => {
    const { id, status } = req.body;
    let localBids = getBids();
    const bid = localBids.find(b => b.id === id);
    if (bid) {
        bid.status = status;
        saveBids(localBids);
    }
    res.json({ success: true });
});

// Route to delete/decline a bid and restore item slot metrics
app.post('/admin/delete-bid', (req, res) => {
    const { id } = req.body;
    let localBids = getBids();
    let localItems = getItems();
    
    const bidToDelete = localBids.find(b => b.id === id);
    if (bidToDelete) {
        const targetItem = localItems.find(i => i.name === bidToDelete.item);
        if (targetItem) {
            targetItem.currentBids = Math.max(0, targetItem.currentBids - bidToDelete.quantity);
        }
        localBids = localBids.filter(b => b.id !== id);
        
        saveItems(localItems);
        saveBids(localBids);
    }
    res.json({ success: true });
});
app.listen(PORT, () => console.log(Server running on port ${PORT}));
