# scripts/

Helper scripts to bridge platform gaps that the app can't solve from inside the browser.

## sync-icloud-to-onedrive.bat (Windows)

Creates a Windows Scheduled Task that mirrors `%USERPROFILE%\iCloudDrive\Sketches` → `%USERPROFILE%\OneDrive\Sketches` every 5 minutes. Useful when iOS Save to Files keeps dropping OneDrive but iCloud Drive stays reliable.

### Prereqs

1. **iCloud for Windows** installed from the Microsoft Store and signed in. After signing in, an `iCloudDrive` folder appears under `C:\Users\<you>\`.
2. **OneDrive** already running and signed in on the same PC (default for most Windows installs).

### Install

1. Download the `.bat` file from this folder (right-click → Save link as).
2. Edit the top of the file if you want different paths, interval, or mirror mode (see comments).
3. Double-click the file. If Task Scheduler refuses, right-click → **Run as administrator**.

You should see "Installed." and a first sync run kicked off immediately.

### What it does

Every N minutes (default 5) runs:
```
robocopy "<src>" "<dst>" /E /XO /R:1 /W:1 /LOG+:<log>
```
That's "copy new and updated files, skip unchanged, never delete from the destination, append output to the log". Safer than `/MIR` because if you accidentally delete a sketch on iPhone, the OneDrive copy survives.

To switch to true two-way mirror (deletes propagate), edit `ROBOFLAGS` near the top of the `.bat`:
```
set ROBOFLAGS=/MIR /R:1 /W:1
```

### Workflow

1. iPhone → Save sketch → Save to Files → **iCloud Drive** → **Sketches** folder.
2. iCloud syncs to Windows in ~30 seconds.
3. Scheduled task runs robocopy within the next ~5 minutes.
4. OneDrive picks up the new file in `OneDrive\Sketches` and uploads it.
5. The sketch is in your OneDrive cloud, ready to open from anywhere.

### Uninstall

Open a command prompt in the same folder and run:
```
sync-icloud-to-onedrive.bat /uninstall
```
or use Task Scheduler GUI to delete the task named `CValRSketch-Sync-iCloud-to-OneDrive`.

### Useful commands while it's installed

```
:: Run the sync immediately, don't wait for the next tick
schtasks /Run /TN "CValRSketch-Sync-iCloud-to-OneDrive"

:: Watch the log live
powershell -Command "Get-Content $env:LOCALAPPDATA\CValRSketch\sync.log -Wait -Tail 10"

:: Pause without uninstalling
schtasks /Change /TN "CValRSketch-Sync-iCloud-to-OneDrive" /DISABLE

:: Re-enable
schtasks /Change /TN "CValRSketch-Sync-iCloud-to-OneDrive" /ENABLE
```
