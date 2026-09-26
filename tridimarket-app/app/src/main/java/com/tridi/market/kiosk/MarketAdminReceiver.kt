package com.tridi.market.kiosk

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import com.tridi.market.MainActivity

class MarketAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        val policy = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (!policy.isDeviceOwnerApp(context.packageName)) return
        val admin = ComponentName(context, MarketAdminReceiver::class.java)
        policy.setLockTaskPackages(admin, arrayOf(context.packageName))
        val homeFilter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        policy.addPersistentPreferredActivity(admin, homeFilter, ComponentName(context, MainActivity::class.java))
    }
}
