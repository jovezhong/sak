import os
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from twilio.rest import Client
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def get_snow_forecast():
    url = "https://www.snow-forecast.com/resorts/Grouse-Mountain/6day/mid?units=m"
    headers = {"User-Agent": "Mozilla/5.0"}
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        table = soup.find('table', class_='forecast-table__table--content')
        if not table: return "No table found."

        dates = []
        today = datetime.now()
        days_row = table.find('tr', {'data-row': 'days'})
        if days_row:
            col_idx = 0
            for td in days_row.find_all('td')[1:]:
                colspan = int(td.get('colspan', 1))
                current_date = today + timedelta(days=col_idx // 3)
                # Format: M/D(Day) e.g., 1/5(Mon)
                formatted_date = current_date.strftime("%-m/%-d(%a)")
                dates.extend([formatted_date] * colspan)
                col_idx += colspan

        def get_row_cells(row_name):
            row = table.find('tr', {'data-row': row_name})
            return [td.get_text(strip=True) for td in row.find_all('td')[1:]] if row else []

        snow_cells = get_row_cells('snow')
        temp_cells = get_row_cells('temperature-max') or get_row_cells('temp-max') or get_row_cells('temp')
        freeze_cells = get_row_cells('freezing-level')

        forecast_data = []
        times = ["AM", "PM", "Night"]
        for i in range(len(snow_cells)):
            snow_str = snow_cells[i]
            try:
                snow_val = float("".join(c for c in snow_str if c.isdigit() or c == '.')) if snow_str else 0.0
            except: snow_val = 0.0
            
            forecast_data.append({
                "date": dates[i] if i < len(dates) else "Soon",
                "time": times[i % 3],
                "snow": snow_val,
                "temp": temp_cells[i] if i < len(temp_cells) else "?",
                "freeze": freeze_cells[i] if i < len(freeze_cells) else "0"
            })

        powder_entries = [e for e in forecast_data if e['snow'] >= 3.0]
        if not powder_entries: return "Grouse: No powder expected."

        max_snow = max(e['snow'] for e in powder_entries)
        
        message = "❄️Grouse Powder❄️\n"
        for e in powder_entries[:4]:
            #session = "Day" if e['time'] in ["AM", "PM"] else "Night"
            session = e['time']
            reason = "Epic" if e['snow'] >= 15 else "Fresh"
            try:
                f_level = int("".join(filter(str.isdigit, e['freeze'])))
                if f_level < 1000: reason += "+Cold"
            except: pass
            
            temp = e['temp']#.replace('°', '').strip()
            # Position emoji before the colon
            best_mark = "🤩" if e['snow'] == max_snow else ""
            message += f"{e['date']} {session}{best_mark}: {int(e['snow'])}cm {reason} {temp}C\n"

        return message.strip()

    except Exception as e:
        return f"Error: {str(e)}"

def send_twilio_notification(body):
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_FROM_NUMBER")
    to_number = os.environ.get("TWILIO_TO_NUMBER")

    if not account_sid or not auth_token:
        print("Twilio credentials not set. Skipping notification.")
        return

    try:
        client = Client(account_sid, auth_token)
        message = client.messages.create(
            body=body,
            from_=from_number,
            to=to_number,
        )
        # print(f"Notification sent! SID: {message.sid}")
        print("SMS sent successfully!")
    except Exception as e:
        print(f"Failed to send Twilio notification: {e}")

if __name__ == "__main__":
    forecast_msg = get_snow_forecast()
    # print(forecast_msg)
    send_twilio_notification(forecast_msg)
