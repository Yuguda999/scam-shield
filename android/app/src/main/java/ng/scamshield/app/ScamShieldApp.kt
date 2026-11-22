package ng.scamshield.app

import android.app.Application
import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.initialize

class ScamShieldApp : Application() {
    val engine: Engine by lazy { FirebaseEngine() }

    override fun onCreate() {
        super.onCreate()
        Firebase.initialize(this)
        // App Check protects the Gemini API. Debug builds use a debug token (string
        // resource firebase_app_check_debug_token, set from local.properties);
        // release builds use Play Integrity.
        Firebase.appCheck.installAppCheckProviderFactory(
            if (BuildConfig.DEBUG) DebugAppCheckProviderFactory.getInstance()
            else PlayIntegrityAppCheckProviderFactory.getInstance(),
        )
    }
}
