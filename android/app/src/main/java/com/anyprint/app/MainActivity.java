package com.anyprint.app;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.anyprint.app.printing.PrinterPlugin;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
