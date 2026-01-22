; RaceLog Inno Setup Script
; This script creates a Windows installer for RaceLog

#define MyAppName "RaceLog"
#define MyAppVersion "1.0.0"
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
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Main executable
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; Browser helper script
Source: "start-browser.bat"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Create data directory for user data
Name: "{app}\data"; Permissions: users-modify

[Icons]
Name: "{group}\RaceLog Server"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Open RaceLog"; Filename: "{app}\start-browser.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\RaceLog Server"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up data directory on uninstall (optional - comment out to preserve user data)
Type: filesandordirs; Name: "{app}\data"
