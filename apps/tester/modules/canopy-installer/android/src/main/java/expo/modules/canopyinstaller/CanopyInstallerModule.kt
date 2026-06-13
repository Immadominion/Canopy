package expo.modules.canopyinstaller

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

private const val ACTION_INSTALL_STATUS = "app.canopy.tester.INSTALL_STATUS"

/**
 * Native installer for the Canopy tester app.
 *
 *  - sha256OfFile: streams the file through MessageDigest (cheap on large APKs).
 *  - installApk: streams the APK into a PackageInstaller session and commits it.
 *    The OS shows the install confirmation (STATUS_PENDING_USER_ACTION), then a
 *    SUCCESS/FAILURE status resolves the JS promise.
 *
 * The caller (JS) has already verified the APK's SHA-256 against the build
 * fingerprint before calling installApk — this module is the OS handoff only.
 */
class CanopyInstallerModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    private var pendingPromise: Promise? = null
    private var receiver: BroadcastReceiver? = null
    // What a STATUS_SUCCESS means for the in-flight op ("installed" or "removed").
    private var pendingSuccessStatus: String = "installed"

    override fun definition() = ModuleDefinition {
        Name("CanopyInstaller")

        // Whether this app currently holds the "install unknown apps" permission.
        // Lets the UI explain the one-time OS prompt before it appears.
        Function("canInstall") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.packageManager.canRequestPackageInstalls()
            } else {
                true
            }
        }

        // The installed versionCode of a package, or null if not installed.
        // Lets the UI show INSTALL vs UPDATE vs "current". An app installed via
        // our PackageInstaller session is visible to us without QUERY_ALL_PACKAGES.
        Function("getInstalledVersion") { packageName: String ->
            try {
                val info = context.packageManager.getPackageInfo(packageName, 0)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    info.longVersionCode
                } else {
                    @Suppress("DEPRECATION")
                    info.versionCode.toLong()
                }
            } catch (_: PackageManager.NameNotFoundException) {
                null
            }
        }

        AsyncFunction("sha256OfFile") { localUri: String ->
            hashFile(fileFromUri(localUri))
        }

        AsyncFunction("installApk") { localUri: String, promise: Promise ->
            startInstall(fileFromUri(localUri), promise)
        }

        // Uninstall a package (e.g. a revoked beta, or a conflicting copy signed
        // with a different key). The OS shows its own uninstall confirmation —
        // Canopy is the installer of record for apps it installed, so no extra
        // permission is needed. Resolves { status: "removed" | "user_cancelled" | "failed" }.
        AsyncFunction("uninstall") { packageName: String, promise: Promise ->
            startUninstall(packageName, promise)
        }

        OnDestroy { unregisterReceiver() }
    }

    private fun fileFromUri(localUri: String): File {
        val path = if (localUri.startsWith("file://")) Uri.parse(localUri).path ?: localUri else localUri
        return File(path)
    }

    private fun hashFile(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun startInstall(file: File, promise: Promise) {
        if (!file.exists()) {
            promise.resolve(resultMap("failed", "FILE_NOT_FOUND"))
            return
        }
        if (pendingPromise != null) {
            promise.resolve(resultMap("failed", "BUSY"))
            return
        }
        pendingPromise = promise
        pendingSuccessStatus = "installed"
        registerReceiver()

        try {
            val installer = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL,
            )
            val sessionId = installer.createSession(params)
            installer.openSession(sessionId).use { session ->
                session.openWrite("canopy.apk", 0, file.length()).use { out ->
                    file.inputStream().use { input -> input.copyTo(out) }
                    session.fsync(out)
                }
                val intent = Intent(ACTION_INSTALL_STATUS).setPackage(context.packageName)
                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    PendingIntent.FLAG_MUTABLE
                } else {
                    0
                }
                val pending = PendingIntent.getBroadcast(context, sessionId, intent, flags)
                session.commit(pending.intentSender)
            }
        } catch (e: Exception) {
            finish("failed", e.message ?: "INSTALL_ERROR")
        }
    }

    private fun startUninstall(packageName: String, promise: Promise) {
        if (pendingPromise != null) {
            promise.resolve(resultMap("failed", "BUSY"))
            return
        }
        // Already gone — treat as a successful removal so callers can no-op.
        try {
            context.packageManager.getPackageInfo(packageName, 0)
        } catch (_: PackageManager.NameNotFoundException) {
            promise.resolve(resultMap("removed", "NOT_INSTALLED"))
            return
        }
        pendingPromise = promise
        pendingSuccessStatus = "removed"
        registerReceiver()

        try {
            val intent = Intent(ACTION_INSTALL_STATUS).setPackage(context.packageName)
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE
            } else {
                0
            }
            val pending = PendingIntent.getBroadcast(context, packageName.hashCode(), intent, flags)
            context.packageManager.packageInstaller.uninstall(packageName, pending.intentSender)
        } catch (e: Exception) {
            finish("failed", e.message ?: "UNINSTALL_ERROR")
        }
    }

    private fun registerReceiver() {
        if (receiver != null) return
        val r = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                    PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                        val confirm = confirmIntent(intent)
                        if (confirm != null) {
                            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            context.startActivity(confirm)
                        } else {
                            finish("failed", "NO_CONFIRM_INTENT")
                        }
                    }
                    PackageInstaller.STATUS_SUCCESS -> finish(pendingSuccessStatus, null)
                    PackageInstaller.STATUS_FAILURE_ABORTED -> finish("user_cancelled", null)
                    else -> {
                        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                        finish("failed", message ?: "INSTALL_FAILED")
                    }
                }
            }
        }
        val filter = IntentFilter(ACTION_INSTALL_STATUS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(r, filter)
        }
        receiver = r
    }

    @Suppress("DEPRECATION")
    private fun confirmIntent(intent: Intent): Intent? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
            intent.getParcelableExtra(Intent.EXTRA_INTENT)
        }
    }

    private fun unregisterReceiver() {
        receiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (_: Exception) {
                // already unregistered
            }
        }
        receiver = null
    }

    private fun finish(status: String, message: String?) {
        val promise = pendingPromise
        pendingPromise = null
        pendingSuccessStatus = "installed" // reset to default; next op sets it explicitly
        unregisterReceiver()
        promise?.resolve(resultMap(status, message))
    }

    private fun resultMap(status: String, message: String?): Map<String, Any?> =
        mapOf("status" to status, "message" to message)
}
