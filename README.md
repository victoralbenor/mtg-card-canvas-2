# MTG Card Canvas - Setup Instructions

## Prerequisites

Before running this application, you need to install:

1. **Node.js** (version 16 or higher)
   - Download from: https://nodejs.org/
   - This will also install npm (Node Package Manager)

2. **Firebase Project**
   - Go to https://console.firebase.google.com/
   - Create a new project
   - Enable Anonymous Authentication
   - Create a Firestore database

## Setup Steps

### 1. Install Node.js

If you haven't already, download and install Node.js from https://nodejs.org/

Verify installation by running:
```powershell
node --version
npm --version
```

### 2. Install Dependencies

Open PowerShell in this directory and run:
```powershell
npm install
```

This will install all required packages:
- React & React DOM
- Vite (build tool)
- Firebase SDK
- Tailwind CSS
- Lucide React (icons)

### 3. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or select existing)
3. Go to **Project Settings** (gear icon) > **General**
4. Scroll down to "Your apps" and click the web icon (`</>`)
5. Register your app and copy the configuration object

6. Open `src/firebase-config.js` and replace the placeholder values with your actual Firebase config:

```javascript
export const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### 4. Enable Firebase Authentication

1. In Firebase Console, go to **Build** > **Authentication**
2. Click **Get Started**
3. Go to **Sign-in method** tab
4. Enable **Anonymous** sign-in provider

### 5. Set Up Firestore Database

1. In Firebase Console, go to **Build** > **Firestore Database**
2. Click **Create database**
3. Choose **Test mode** (or set up custom rules)

For production, use these security rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 6. Run the Development Server

```powershell
npm run dev
```

This will start the Vite development server. Open your browser to the URL shown (usually http://localhost:5173)

### 7. Build for Production (Optional)

To create a production build:
```powershell
npm run build
```

The built files will be in the `dist/` folder.

## Troubleshooting

### Port Already in Use
If port 5173 is already in use, Vite will automatically try the next available port.

### Firebase Errors
- Make sure you've replaced all placeholder values in `src/firebase-config.js`
- Verify that Anonymous authentication is enabled
- Check that Firestore database is created

### Module Not Found Errors
Run `npm install` again to ensure all dependencies are installed.

## Features

- **Search Cards**: Type MTG card names in the search bar
- **Canvas View**: Drag and arrange cards freely with pan/zoom
- **Tag Baskets**: Organize cards by tags in column view
- **Sticky Notes**: Add notes to your board
- **Bulk Add**: Import multiple cards at once
- **Export/Import**: Save and load your board state

## Next Steps

Once running:
1. The app will automatically create 5 basic land cards on first load
2. Search for cards using the top search bar
3. Right-click cards to add tags
4. Switch between Canvas and Baskets view using the top buttons
5. Use space bar or hand tool to pan the canvas
6. Scroll to zoom in/out

Enjoy organizing your MTG cards!
