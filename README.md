# LNotifications

Custom Telegram notifications at the top of the screen with smooth animations and an automatic first‑run setup wizard.

**Key features:**
- 🔔 Notifications centered at the top of the screen (don’t overlap the system tray)
- 🧑‍🦱 Sender avatars (Telegram profile photos)
- 📹 Message type detection: voice (with duration), video, photo, sticker, document, location, poll, contact
- 💬 Highlighting of mentions of your name or @username (animated white border)
- 🎨 Transparent window with blur effect, soft shadow and animation
- ⚙️ First‑run setup wizard (enter api_id, api_hash, phone number and the code from Telegram)
- 🧩 Fully self‑contained: after setup it runs in the background, no console required

## 🚀 Quick start

1. Download the latest installer from [Releases](https://github.com/landovv/LNotifications/releases).
2. Install and launch.
3. On first launch a setup window will open:
   - Enter your `api_id` and `api_hash` (get them at [my.telegram.org/apps](https://my.telegram.org/apps)).
   - Enter your phone number with country code (e.g. `+79991234567`).
   - Enter the code that will arrive in Telegram.
   - If you have a cloud password, enter it as well.
4. After successful login the wizard closes and the program starts listening for new messages. Notifications will appear at the top of the screen.

On subsequent launches the wizard does not appear — the program starts immediately.

### ⚠️ Note for Windows users
On first launch, SmartScreen may show a warning. Click "More info" → "Run anyway". This happens because the installer does not have a paid code‑signing certificate. The program is completely safe – its source code is open.

## 🛠 Installation from source (for developers)

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or newer)
- [Python](https://www.python.org/) 3.9 or newer
- Git

### 1. Clone the repository
```bash
git clone https://github.com/landovv/LNotifications.git
cd LNotifications
