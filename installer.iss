; RaceLog Inno Setup Script
; This script creates a Windows installer for RaceLog

#define MyAppName "RaceLog"
#define MyAppVersion "1.4.0"
#define MyAppPublisher "RaceLog"
#define MyAppURL "http://localhost:3000"
#define MyAppExeName "RaceLog.exe"

[Setup]
; NOTE: The value of AppId uniquely identifies this application.
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer
OutputBaseFilename=RaceLog-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Main executable
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; Browser helper script
Source: "start-browser.bat"; DestDir: "{app}"; Flags: ignoreversion
; Combined launcher (starts server + opens browser)
Source: "launch-racelog.bat"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Create data directory for user data
Name: "{app}\data"; Permissions: users-modify

[Icons]
Name: "{group}\RaceLog"; Filename: "{app}\launch-racelog.bat"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\RaceLog Server Only"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Open RaceLog in Browser"; Filename: "{app}\start-browser.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\RaceLog"; Filename: "{app}\launch-racelog.bat"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\launch-racelog.bat"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent shellexec

[UninstallDelete]
; Clean up data directory on uninstall (optional - comment out to preserve user data)
Type: filesandordirs; Name: "{app}\data"
