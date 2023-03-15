import { acceptHMRUpdate, defineStore } from "pinia";

// Import the functions you need from the SDKs you need
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
import { getPerformance } from "firebase/performance";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { initializeApp } from "firebase/app";
import { getRemoteConfig, fetchAndActivate } from "firebase/remote-config";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

export const useFirebase = defineStore("firebase", () => {
    if ((<any>window).firestore) return (<any>window).firestore;
    // Your web app's Firebase configuration
    const firebaseConfig = {
        apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY,
        authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN,
        databaseURL: (import.meta as any).env.VITE_FIREBASE_DATABASE_URL,
        projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: (import.meta as any).env.VITE_FIREBASE_APP_ID,
        measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID,
    };

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);

    const auth = getAuth();
    const firestore = getFirestore();
    const functions = getFunctions(app, "europe-west1");
    const database = getDatabase(app);
    const storage = getStorage();
    const analytics = getAnalytics(app);
    const performance = getPerformance(app);
    const remoteConfig = getRemoteConfig(app);

    fetchAndActivate(remoteConfig);

    if ((import.meta as any).env.DEV) {
        // eslint-disable-next-line no-console
        console.log("Development mode");

        connectAuthEmulator(
            auth,
            (import.meta as any).env.VITE_FIRESTORE_AUTH_HOST ||
                `http://${(import.meta as any).env.VITE_HOST || "localhost"}:${
                    (import.meta as any).env.VITE_AUTH_PORT || 8012
                }`
        );

        connectFirestoreEmulator(
            firestore,
            (import.meta as any).env.VITE_HOST || "localhost",
            (import.meta as any).env.VITE_FIRESTORE_PORT || 8014
        );

        connectFunctionsEmulator(
            functions,
            (import.meta as any).env.VITE_HOST || "localhost",
            (import.meta as any).env.VITE_FUNCTION_PORT || 8013
        );

        connectDatabaseEmulator(
            database,
            (import.meta as any).env.VITE_HOST || "localhost",
            (import.meta as any).env.VITE_DATABASE_PORT || 8015
        );

        connectStorageEmulator(
            storage,
            (import.meta as any).env.VITE_HOST || "localhost",
            (import.meta as any).env.VITE_STORAGE_PORT || 8016
        );

        (<any>window).FIREBASE_APPCHECK_DEBUG_TOKEN =
            (import.meta as any).env.VITE_APP_CHECK_DEBUG_TOKEN;
    }

    const check = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider((import.meta as any).env.VITE_RECAPTCHA_KEY),

        // Optional argument. If true, the SDK automatically refreshes App Check
        // tokens as needed.
        isTokenAutoRefreshEnabled: true,
    });

    const exportFirestore = {
        app,
        remoteConfig,
        auth,
        database,
        firestore,
        functions,
        storage,
        analytics,
        performance,
        check,
    };

    (<any>window).firestore = exportFirestore;
    return exportFirestore;
});

/**
 * Pinia supports Hot Module replacement so you can edit your stores and
 * interact with them directly in your app without reloading the page.
 *
 * @see https://pinia.esm.dev/cookbook/hot-module-replacement.html
 * @see https://vitejs.dev/guide/api-hmr.html
 */
if ((import.meta as any).hot) {
    (import.meta as any).hot.accept(acceptHMRUpdate(useFirebase, (import.meta as any).hot));
}
