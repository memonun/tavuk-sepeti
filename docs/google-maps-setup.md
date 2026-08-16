# Google Maps API Setup Guide

## Problem: Address Search Not Working / Session Errors

If you're experiencing:
- "Adres araması şu an kullanılamıyor" (Address search currently unavailable)
- "Oturum bulunamadı, tekrar giriş yapın" (Session not found, please log in again)

Follow this setup guide.

## Prerequisites

1. Google Cloud Project with billing enabled
2. Google Maps Platform API credentials

## Step 1: Enable Required APIs

In Google Cloud Console (https://console.cloud.google.com):

1. Go to APIs & Services > Enabled APIs & Services
2. Click "Enable APIs and Services"
3. Search for and enable **all** of these:
   - **Maps JavaScript API** (required for map rendering)
   - **Places API** (required for address autocomplete)
   - **Geocoding API** (used by server-side address geocoding)
   - **Roads API** (optional, for advanced routing)

## Step 2: Create API Key

1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "API Key"
3. A new API key will be generated
4. **IMPORTANT**: Configure key restrictions:

### Key Restrictions Settings

**Application restrictions:**
- Select "HTTP referrers (web sites)"
- Add these referrer patterns:
  - `https://apuhanciftligi.com/*`
  - `https://www.apuhanciftligi.com/*`
  - `http://localhost:3000/*` (for local development)
  - `http://localhost/*` (for local testing)

**API restrictions:**
- Select "Restrict key to specified APIs"
- Select **only** these APIs:
  - Google Maps JavaScript API
  - Places API
  - Geocoding API

## Step 3: Configure Environment Variables

1. Copy your API key
2. Add to `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=YOUR_API_KEY_HERE
   ```
3. Restart the development server: `npm run dev`

## Step 4: Verify Setup

1. Go to checkout page (/odeme)
2. Try typing in the address search field
3. You should see address suggestions appearing

## Common Issues

### Issue: "Address search not working" or "Session not found"

**Causes:**
1. ❌ Places API not enabled
2. ❌ API key has wrong API restrictions
3. ❌ Referrer restrictions blocking `apuhanciftligi.com`
4. ❌ API key used in development without `localhost` referrer

**Fix:**
1. Verify all APIs are enabled (see Step 1)
2. Check API restrictions only include: Google Maps JS API, Places API, Geocoding API
3. Add your domain to HTTP referrers
4. Wait 5-10 minutes for changes to propagate

### Issue: Map loads but can't place pins

**Causes:**
1. ❌ Missing `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` for custom styling
2. ❌ Session token expired (fixed in recent update)

**Fix:**
1. Use default map styling (omit NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID)
2. Or create custom Map Style in Cloud Console and add Map ID to `.env.local`

## Testing Locally

During development, the app needs to accept `localhost` requests:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=YOUR_KEY_HERE
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Make sure your Google API key referrer settings include `http://localhost:*`

## Production Deployment

Before deploying:

1. Verify `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is set in production
2. Verify referrer includes `https://apuhanciftligi.com/*`
3. Test at least once on production domain before going live

## Google Cloud Console Quick Links

- [Enable APIs](https://console.cloud.google.com/apis/dashboard)
- [Manage Credentials](https://console.cloud.google.com/apis/credentials)
- [Billing](https://console.cloud.google.com/billing)

## Support

If issues persist:
1. Check browser console (F12) for any JavaScript errors
2. Check Network tab for failed requests to googleapis.com
3. Verify API key has billing enabled
4. Wait 10-15 minutes after making credential changes
