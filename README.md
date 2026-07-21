# LNotifications

Custom Telegram notifications at the top of the screen with smooth animations and an automatic first-run setup wizard.

**Key features:**
- 🔔 Notifications centered at the top of the screen (don't overlap the system tray)
- 🧑 Sender avatars (Telegram profile photos)
- 📹 Message type detection: voice (with duration), video, photo, sticker, document, location, poll, contact
- 💬 Highlighting of mentions of your name or @username (animated white border)
- 🎨 Transparent window with blur effect, soft shadow and animation
- ⚙️ First-run setup wizard (enter api_id, api_hash, phone number and the code from Telegram)
- 🧩 Fully self-contained: after setup it runs in the background, no console required

---

# 🚀 Quick start (recommended for most users)

1. Download the latest installer from **Releases**.
2. Install and launch the program.
3. On first launch a setup window will open:
   - Enter your `api_id` and `api_hash` (get them at https://my.telegram.org/apps).
   - Enter your phone number with country code (for example `+79991234567`).
   - Enter the code that arrives in Telegram.
   - If you have a cloud password enabled, enter it as well.
4. After successful login the wizard closes automatically and the program starts listening for new messages. Notifications will appear at the top of the screen.

On subsequent launches the wizard will not appear — the program starts immediately.

---

## ⚠️ Note for Windows users

On first launch, Windows SmartScreen may display a warning.

Click:

**More info → Run anyway**

This happens because the installer does not have a paid code-signing certificate.

The application is completely safe — its source code is open.

---

# 🛠 Running from source (if you don't want to use the installer)

If you prefer to run the program directly from the source code, follow these steps.

**No programming knowledge is required.** Just follow the instructions below.

---

## 1. Install the required programs

Install the following software:

### Node.js

Download and install the **LTS** version from:

https://nodejs.org/

### Python

Download Python **3.9 or newer** from:

https://python.org/

**Important:** During installation, make sure to check the box:

> **Add Python to PATH**

Without this option, Windows may not recognize Python.

---

## 2. Check that everything is installed

Open a terminal.

### Windows

Press:

```
Win + R
```

Type:

```
cmd
```

and press **Enter**.

### macOS / Linux

Open **Terminal**.

Now type these commands one by one:

```bash
node --version
```

then

```bash
python --version
```

If both commands display version numbers (for example `v22.15.0` and `Python 3.12.5`), everything is installed correctly.

---

## 3. Open the project folder

Download or clone the project.

Open the folder containing the project files.

Then open a terminal **inside that folder**.

On Windows you can simply:

- Hold **Shift**
- Right-click inside the folder
- Choose **Open in Terminal** (or **Open PowerShell window here**)

---

## 4. Install the required Python libraries

Before the program can start, you need to install the libraries it uses.

This is very easy — you only need to run **one command**.

The project already contains a file named:

```
requirements.txt
```

This file lists everything the program needs.

### In the same terminal, type the command below exactly as it is written:

```bash
pip install -r requirements.txt
```

### Then press **Enter**.

> **This is the most important command in the installation process.**
>
> Make sure you type it exactly like this:
>
> ```bash
> pip install -r requirements.txt
> ```

After pressing **Enter**, Python will automatically download and install everything the application needs.

This may take anywhere from a few seconds to several minutes depending on your internet connection.

When the installation finishes, you are ready to continue.

---

## 5. Install Node.js dependencies

In the same terminal, run:

```bash
npm install
```

Wait until the installation finishes.

---

## 6. Start the application

Run:

```bash
npm start
```

If this is your first launch, the setup wizard will appear automatically.

Enter:

- your **API ID**
- your **API Hash**
- your **phone number**
- the verification code from Telegram
- your cloud password (if enabled)

After logging in successfully, the wizard will close and the application will continue running in the background.

From now on, every new Telegram message will appear as a custom notification at the top of your screen.

The next time you launch the application, you won't have to log in again.
