# le-portable

A functional prototype of a three-step eSIM activation flow for a fictional provider, Aurora Mobile.

1. **Get ready**: checks the phone's IMEI, finds the order, confirms the internet connection, and asks the customer to keep their current SIM in.
2. **Scan**: a simulated camera reads a QR code (or the customer types the activation code), then the code is verified, the eSIM downloaded and the line activated.
3. **Success**: shows the customer's number, plan, phone and SIM details.

Everything runs in the browser. There's no real backend: `js/api.js` pretends to be one, with realistic delays and failures. All data is synthetic.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page shell |
| `style.css` | All styling. Brand colours are at the top |
| `js/app.js` | Draws each screen from the current state and runs the activation flow |
| `js/store.js` | State management: one state object, changed only through actions |
| `js/api.js` | Mock backend: business rules, delays, failures, saved changes |
| `js/validation.js` | IMEI (with Luhn check digit), order number and activation code rules |
| `js/data.js` | Synthetic phones, orders and activation codes |

## Running it locally

The scripts use JavaScript modules, which browsers only load over http. Opening `index.html` directly from Finder won't work. In VS Code, right-click `index.html` → **Open with Live Server**.

Open the browser console (Cmd+Option+J in Chrome) to see every state change as it happens.

## Test scenarios

Click **Test data** to fill in sample phones and orders.

| Try this | What happens |
| --- | --- |
| iPhone 15 Pro + Mia Chen, scan "Your QR code" | Activates successfully |
| Pixel 8 (locked) | Phone check fails: locked to another carrier |
| Galaxy A10 | Phone check fails: no eSIM support |
| "Typo" IMEI | Fails the check digit before calling the server |
| Sofia Rossi | Order already activated |
| Noah Williams | QR code expired → "Send me a new code" → activates |
| Camera on "Someone else's QR code" | Code belongs to a different order |
| Camera on "A code from another provider" | Rejected as not an Aurora Mobile code |
| Camera on "A blurry, unreadable code" | Keeps scanning with a hint |
| Network: Drops once | Download fails, "Try again" resumes where it stopped |
| Network: Offline | Checklist won't complete; calls fail mid-scan |

Once an order is activated it stays activated in your browser. Use **Reset all demo data** to start again.
