Porting the MTG Infinite Canvas to Your System

This guide explains how to set up the application locally using Vite, Tailwind CSS, and Firebase.

1. Initialize Your Project

Run the following commands in your terminal to create a new React project:

# Create the project using Vite
npm create vite@latest mtg-canvas -- --template react
cd mtg-canvas

# Install dependencies
npm install
npm install firebase lucide-react
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p


2. Configure Tailwind CSS

Update your tailwind.config.js to include the paths to all of your template files:

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}


Add the Tailwind directives to your ./src/index.css:

@tailwind base;
@tailwind components;
@tailwind utilities;


3. Set Up Firebase

Go to the Firebase Console.

Create a new project.

Authentication: Enable "Anonymous" sign-in in the Build > Authentication > Sign-in method tab.

Firestore: Create a database in "Test Mode" or set the following Security Rules:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}


4. Adapt the Code

In your project's App.jsx, you need to replace the environment variables (like __firebase_config) with your actual Firebase project configuration found in your Firebase Project Settings.

Adjustments needed in App.jsx:

Firebase Config: Replace the dynamic JSON.parse with your object.

App ID: Replace __app_id with a unique string (e.g., "my-mtg-app").

Auth: Simplify the signInWithCustomToken logic to just use signInAnonymously if you aren't using a custom backend.

Modified Setup Section:

// Replace with your actual config from Firebase Console
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "mtg-canvas-v1"; // Your local ID

// Inside useEffect for Auth:
const initAuth = async () => {
  try {
    await signInAnonymously(auth);
  } catch (err) {
    console.error("Auth failed", err);
  }
};


5. Run Locally

npm run dev
