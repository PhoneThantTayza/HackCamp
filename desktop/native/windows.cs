using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using Microsoft.Win32;

public static class DesktopBridge {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out RECT rect);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("Magnification.dll")] static extern bool MagInitialize();
    [DllImport("Magnification.dll")] static extern bool MagUninitialize();
    [DllImport("Magnification.dll")] static extern bool MagGetFullscreenColorEffect(ref Colour effect);
    [DllImport("Magnification.dll")] static extern bool MagSetFullscreenColorEffect(ref Colour effect);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Colour { [MarshalAs(UnmanagedType.ByValArray, SizeConst=25)] public float[] values; }
    static readonly object outputLock = new object();
    static readonly object colourLock = new object();
    static volatile bool watching = true, running = true;
    static int selectionBusy;
    static bool magReady, colourOwned;
    static Colour original, applied;
    static readonly string appearancePath = @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    static readonly string[] appearanceNames = { "AppsUseLightTheme", "SystemUsesLightTheme" };
    static readonly Dictionary<string, object> appearanceSaved = new Dictionary<string, object>();
    static readonly Dictionary<string, RegistryValueKind> appearanceKinds = new Dictionary<string, RegistryValueKind>();
    static void NotifyAppearance() { UIntPtr result; SendMessageTimeout(new IntPtr(0xffff), 0x001a, UIntPtr.Zero, "ImmersiveColorSet", 2, 1000, out result); }
    static bool SetAppearance(bool enabled) {
        if(!enabled && appearanceSaved.Count==0) return false;
        using(var key=Registry.CurrentUser.CreateSubKey(appearancePath)) {
            if(key==null) throw new Exception("Windows appearance settings are unavailable. Open system appearance settings.");
            foreach(string name in appearanceNames) {
                if(enabled) {
                    if(!appearanceSaved.ContainsKey(name)) {
                        var old=key.GetValue(name); appearanceSaved[name]=old;
                        if(old!=null) appearanceKinds[name]=key.GetValueKind(name);
                    }
                    key.SetValue(name, 0, RegistryValueKind.DWord);
                    if(!Object.Equals(key.GetValue(name), 0)) throw new Exception("Windows did not enable Dark mode. Retry or open system appearance settings.");
                } else if(appearanceSaved.ContainsKey(name)) {
                    // Leave values changed independently by the user alone.
                    if(Object.Equals(key.GetValue(name), 0)) {
                        if(appearanceSaved[name]==null) key.DeleteValue(name, false);
                        else key.SetValue(name, appearanceSaved[name], appearanceKinds[name]);
                    }
                    appearanceSaved.Remove(name); appearanceKinds.Remove(name);
                }
            }
        }
        NotifyAppearance(); return enabled;
    }
    // UI Automation uses doubles; Electron's physical-to-DIP conversion expects integer pixels.
    static object Rect(double x, double y, double w, double h) {
        double left=Math.Floor(x), top=Math.Floor(y);
        return new { x=left, y=top, width=Math.Ceiling(x+w)-left, height=Math.Ceiling(y+h)-top };
    }
    static void Emit(object value) { lock(outputLock) Console.WriteLine(new JavaScriptSerializer().Serialize(value)); }
    static void RestoreColour() {
        lock(colourLock) {
            if(!colourOwned) return;
            Colour current=new Colour { values=new float[25] };
            bool unchanged=MagGetFullscreenColorEffect(ref current);
            if(unchanged) for(int i=0;i<25;i++) if(Math.Abs(current.values[i]-applied.values[i])>0.0001f) unchanged=false;
            // Preserve a filter the user changed through another app while Clearspace ran.
            if(unchanged && !MagSetFullscreenColorEffect(ref original)) throw new Exception("Windows could not restore the previous colour filter. Retry or open system colour filters.");
            colourOwned=false;
        }
    }

    static void Context() {
        if (!watching) return;
        try {
            IntPtr window = GetForegroundWindow(); uint pid; GetWindowThreadProcessId(window, out pid);
            Process app = Process.GetProcessById((int)pid); RECT rect; GetWindowRect(window, out rect);
            object focus = null;
            try {
                AutomationElement element = AutomationElement.FocusedElement;
                if (element != null && !element.Current.IsPassword && element.Current.ProcessId == (int)pid) {
                    var bounds = element.Current.BoundingRectangle;
                    if(!bounds.IsEmpty) focus = Rect(bounds.X, bounds.Y, bounds.Width, bounds.Height);
                }
            } catch { }
            Emit(new { type="context", accessibility=true, units="physical", app=new { name=app.ProcessName, id=app.ProcessName.ToLowerInvariant(), pid=pid },
                window=Rect(rect.Left, rect.Top, rect.Right-rect.Left, rect.Bottom-rect.Top), focus=focus });
        } catch { Emit(new { type="context", accessibility=false, units="physical" }); }
    }
    static void Command(Dictionary<string, object> data) {
        object id = data.ContainsKey("requestId") ? data["requestId"] : 0;
        try {
            string command = data["command"] as string;
            if(command == "watch") { watching = data.ContainsKey("enabled") && (bool)data["enabled"]; return; }
            if(command == "permission") { Emit(new { requestId=id, accessibility=true }); return; }
            if(command == "appearance") { Emit(new { requestId=id, applied=SetAppearance(data.ContainsKey("enabled") && (bool)data["enabled"]) }); return; }
            if(command == "colour") {
                lock(colourLock) {
                    if (data["matrix"] == null) { RestoreColour(); Emit(new { requestId=id, applied=false }); return; }
                    if (!magReady) throw new Exception("Windows colour filters are unavailable. Use Windows Accessibility → Color filters.");
                    var entries = (System.Collections.IList)data["matrix"];
                    if(entries.Count != 25) throw new Exception("Invalid colour matrix.");
                    if(!colourOwned && !MagGetFullscreenColorEffect(ref original)) throw new Exception("Could not preserve the current Windows colour filter.");
                    Colour next = new Colour { values=new float[25] };
                    for(int i=0;i<25;i++) { next.values[i]=Convert.ToSingle(entries[i]); if(float.IsNaN(next.values[i]) || Math.Abs(next.values[i])>4) throw new Exception("Invalid colour matrix."); }
                    if(!MagSetFullscreenColorEffect(ref next)) throw new Exception("Windows declined the colour filter. Use Windows Accessibility → Color filters.");
                    applied=next; colourOwned=true;
                    Colour actual=new Colour { values=new float[25] };
                    if(!MagGetFullscreenColorEffect(ref actual)) { RestoreColour(); throw new Exception("Windows could not verify the colour filter."); }
                    for(int i=0;i<25;i++) if(Math.Abs(actual.values[i]-next.values[i])>0.0001f) { RestoreColour(); throw new Exception("Windows did not apply the requested colour filter. Another display filter may be active."); }
                    Emit(new { requestId=id, applied=true }); return;
                }
            }
            if(command == "selection") {
                if(!watching) throw new Exception("Enable desktop detection or paste text into the reading view.");
                IntPtr window = GetForegroundWindow(); uint pid; GetWindowThreadProcessId(window, out pid);
                var element = AutomationElement.FocusedElement;
                for(int i=0; i<5 && element!=null; i++) {
                    if(element.Current.IsPassword || element.Current.ProcessId != (int)pid) break;
                    object pattern;
                    if(element.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) {
                        var ranges = ((TextPattern)pattern).GetSelection(); var text = new StringBuilder();
                        foreach(var range in ranges) { if(text.Length>=32768) break; text.Append(range.GetText(32768-text.Length)); }
                        if(!String.IsNullOrWhiteSpace(text.ToString())) { Emit(new { requestId=id, text=text.ToString(), source=Process.GetProcessById((int)pid).ProcessName }); return; }
                    }
                    element=TreeWalker.ControlViewWalker.GetParent(element);
                }
                throw new Exception("This app did not expose selected text. Copy the passage and use Paste clipboard in the reading view.");
            }
            throw new Exception("Unknown desktop command.");
        } catch(Exception error) {
            if(data.ContainsKey("command") && (string)data["command"]=="colour") Emit(new { requestId=id, error=error.Message, applied=colourOwned });
            else Emit(new { requestId=id, error=error.Message });
        }
    }
    static byte[] ReadExactly(Stream stream, int count) {
        var bytes = new byte[count]; int offset=0;
        while(offset<count) { int read=stream.Read(bytes,offset,count-offset); if(read==0) return null; offset+=read; }
        return bytes;
    }
    static void NativeHost() {
        var input=Console.OpenStandardInput(); var output=Console.OpenStandardOutput(); var json=new JavaScriptSerializer();
        string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Clearspace", "browser-settings.json");
        while(true) {
            var header=ReadExactly(input,4); if(header==null) return; int length=BitConverter.ToInt32(header,0);
            if(length<1 || length>4096) return;
            var body=ReadExactly(input,length); if(body==null) return;
            try {
                var request=json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(body));
                if(!request.ContainsKey("type") || (string)request["type"]!="get-settings") return;
                object settings=null;
                try {
                    var snapshot=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));
                    double now=(DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds;
                    if(Convert.ToDouble(snapshot["expiresAt"])>now) settings=snapshot["settings"];
                } catch { }
                var bytes=Encoding.UTF8.GetBytes(json.Serialize(new { type="clearspace:desktop-settings", settings=settings }));
                output.Write(BitConverter.GetBytes(bytes.Length),0,4); output.Write(bytes,0,bytes.Length); output.Flush();
            } catch { return; }
        }
    }
    [STAThread] public static void Main(string[] args) {
        foreach(string arg in args) if(arg.StartsWith("chrome-extension://")) { NativeHost(); return; }
        Console.OutputEncoding=new UTF8Encoding(false); SetProcessDPIAware();
        original=new Colour { values=new float[25] }; magReady=MagInitialize();
        var commands=new Thread(() => {
            try { string line; while((line=Console.ReadLine())!=null) {
                if(line.Length>10000) continue;
                try {
                    var request=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line);
                    if(request.ContainsKey("command") && (string)request["command"]=="selection") {
                        if(Interlocked.CompareExchange(ref selectionBusy,1,0)!=0) { Emit(new { requestId=request["requestId"], error="The previous app has not responded. Paste the passage into the reading view instead." }); continue; }
                        var selection=new Thread(() => { try { Command(request); } finally { Interlocked.Exchange(ref selectionBusy,0); } });
                        selection.SetApartmentState(ApartmentState.STA); selection.IsBackground=true; selection.Start();
                    } else Command(request);
                } catch { }
            } } finally {
                running=false; try { RestoreColour(); } catch { } try { SetAppearance(false); } catch { }
                if(magReady) MagUninitialize(); Environment.Exit(0);
            }
        });
        commands.SetApartmentState(ApartmentState.STA); commands.IsBackground=true; commands.Start();
        // A stuck third-party accessibility provider cannot prevent stdin's exit cleanup.
        while(running) { Context(); Thread.Sleep(400); }
    }
}
