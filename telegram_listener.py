import asyncio
import sys
import base64
import json
import os
import argparse
from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError, PasswordHashInvalidError
from telethon.tl.types import DocumentAttributeAudio, DocumentAttributeVideo, DocumentAttributeFilename
import aiohttp
from aiohttp import web

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=47856)
parser.add_argument('--user-data', type=str, default='.')
parser.add_argument('--no-server', action='store_true')
args = parser.parse_args()

PORT = args.port
USER_DATA = args.user_data
CONFIG_PATH = os.path.join(USER_DATA, 'config.json')

def load_config():
    if not os.path.exists(CONFIG_PATH):
        print(f"Error: config.json not found at {CONFIG_PATH}")
        sys.exit(1)
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

config = load_config()
telegram_cfg = config['telegram']
notif_cfg = config.get('notifications', {})

API_ID = telegram_cfg['api_id']
API_HASH = telegram_cfg['api_hash']
SESSION_NAME = os.path.join(USER_DATA, telegram_cfg.get('session_name', 'my_session'))

client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
avatar_cache = {}
MY_NAME = ''
MY_USERNAME = ''
authorized = False

def detect_mime_type(data: bytes) -> str:
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return 'image/webp'
    return 'image/jpeg'

async def get_avatar_base64(user):
    if not user:
        return None
    user_id = user.id
    if user_id in avatar_cache:
        return avatar_cache[user_id]
    try:
        photo_bytes = await client.download_profile_photo(user, file=bytes, download_big=False)
        if photo_bytes:
            mime = detect_mime_type(photo_bytes)
            encoded = base64.b64encode(photo_bytes).decode('utf-8')
            data_url = f'data:{mime};base64,{encoded}'
            avatar_cache[user_id] = data_url
            return data_url
    except Exception as e:
        print(f"[ERROR] Avatar download failed: {e}")
    try:
        photo_bytes = await client.download_profile_photo(user, file=bytes, download_big=True)
        if photo_bytes:
            mime = detect_mime_type(photo_bytes)
            encoded = base64.b64encode(photo_bytes).decode('utf-8')
            data_url = f'data:{mime};base64,{encoded}'
            avatar_cache[user_id] = data_url
            return data_url
    except Exception as e:
        print(f"[ERROR] Large avatar download failed: {e}")
    return None

async def send_notification(sender_name, text, avatar_data_url, mention=False):
    url = f'http://127.0.0.1:{PORT}/notify'
    payload = {
        'sender': sender_name,
        'text': text,
        'duration': notif_cfg.get('duration', 5000),
        'avatar': avatar_data_url,
        'mention': mention
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=2) as resp:
                if resp.status != 200:
                    print(f"[Server] Response {resp.status}: {await resp.text()}")
    except Exception as e:
        print(f"[Error sending notification] {e}")

@client.on(events.NewMessage(incoming=True))
async def handler(event):
    if event.out or not authorized:
        return
    chat = await event.get_chat()
    sender = await event.get_sender()
    name = 'Unknown'
    if sender:
        name = getattr(sender, 'first_name', None) or getattr(sender, 'title', None) or (chat.title if chat else 'Unknown')

    text = event.message.message or ''
    if not text and event.message.media:
        msg = event.message
        if msg.voice:
            doc = msg.voice
            duration = 0
            for attr in doc.attributes:
                if isinstance(attr, DocumentAttributeAudio):
                    duration = attr.duration
                    break
            mins, secs = divmod(duration, 60)
            text = f"🎤 Voice {mins}:{secs:02d}" if mins > 0 else f"🎤 Voice 0:{secs:02d}"
        elif msg.video:
            doc = msg.video
            duration = 0
            for attr in doc.attributes:
                if isinstance(attr, DocumentAttributeVideo):
                    duration = attr.duration
                    break
            if duration:
                mins, secs = divmod(duration, 60)
                text = f"📹 Video ({mins}:{secs:02d})" if mins > 0 else f"📹 Video (0:{secs:02d})"
            else:
                text = "📹 Video"
        elif msg.photo:
            text = '📷 Photo'
        elif msg.sticker:
            emoji = getattr(msg.sticker, 'emoji', '')
            text = f"🏷️ Sticker {emoji}" if emoji else "🏷️ Sticker"
        elif msg.document:
            doc = msg.document
            file_name = ''
            for attr in doc.attributes:
                if isinstance(attr, DocumentAttributeFilename):
                    file_name = attr.file_name
                    break
            text = f"📎 Document: {file_name}" if file_name else "📎 Document"
        elif msg.geo:
            text = '📍 Location'
        elif msg.contact:
            text = '👤 Contact'
        elif msg.poll:
            text = '📊 Poll'
        else:
            text = '[media]'

    is_mention = False
    if text:
        text_lower = text.lower()
        if MY_NAME and MY_NAME in text_lower:
            is_mention = True
        elif MY_USERNAME and MY_USERNAME in text_lower:
            is_mention = True

    print(f"[Message] {name}: {text[:50]}...")
    avatar_url = await get_avatar_base64(sender) if sender else None
    await send_notification(name, text, avatar_url, mention=is_mention)

async def main():
    global MY_NAME, MY_USERNAME, authorized

    if args.no_server:
        await client.start()
        authorized = True
    else:
        await client.connect()   # устанавливаем соединение, не запрашивая телефон

        app = web.Application()
        app.router.add_post('/setup', setup_handler)

        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', PORT)
        await site.start()
        print(f"Setup server started on port {PORT}")

        # Ждём, пока не авторизуемся через HTTP-команды
        while not authorized:
            await asyncio.sleep(1)

        await site.stop()
        print("Setup server stopped")

    me = await client.get_me()
    MY_NAME = me.first_name.lower() if me.first_name else ''
    MY_USERNAME = ('@' + me.username).lower() if me.username else ''
    print(f"Authorized as {MY_NAME} (@{me.username})")

    print("Listening for messages...")
    await client.run_until_disconnected()

async def setup_handler(request):
    global authorized
    data = await request.json()
    action = data.get('action')
    try:
        if action == 'send_code':
            phone = data['phone']
            await asyncio.wait_for(client.send_code_request(phone), timeout=10.0)
            return web.json_response({'status': 'code_sent'})
        elif action == 'sign_in':
            phone = data['phone']
            code = data['code']
            try:
                await client.sign_in(phone, code=code)
                authorized = True
                return web.json_response({'status': 'ok'})
            except SessionPasswordNeededError:
                return web.json_response({'status': 'password_needed'})
        elif action == 'sign_in_password':
            password = data['password']
            await client.sign_in(password=password)
            authorized = True
            return web.json_response({'status': 'ok'})
    except asyncio.TimeoutError:
        return web.json_response({'status': 'error', 'message': 'Telegram request timed out'}, status=400)
    except Exception as e:
        return web.json_response({'status': 'error', 'message': str(e)}, status=400)
    return web.json_response({'status': 'unknown_action'}, status=400)

if __name__ == '__main__':
    asyncio.run(main())