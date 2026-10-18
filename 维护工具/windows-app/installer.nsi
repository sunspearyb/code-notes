; 法典笔记 Windows 安装程序。由 维护工具/制作各终端版本.py 调用 makensis 生成。
; 按用户安装，不需要管理员权限。笔记保存在 %LOCALAPPDATA%\FadianNotes，卸载和升级都不会删除。
Unicode true
SetCompressor /SOLID lzma
!include MUI2.nsh

; EXE、OUTFILE、VERSION（四段数字）、TAG（版本号）由制作脚本传入；APPNAME、APPID 区分不同法典的应用，默认为法典笔记
!ifndef APPNAME
  !define APPNAME "法典笔记"
!endif
!ifndef APPID
  !define APPID "FadianNotes"
!endif
Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
RequestExecutionLevel user
VIProductVersion "${VERSION}"
VIAddVersionKey /LANG=2052 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=2052 "FileDescription" "${APPNAME}安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "法典笔记"

!define MUI_ICON "..\应用图标\windows.ico"
!define MUI_UNICON "..\应用图标\windows.ico"
!define MUI_WELCOMEPAGE_TEXT "将在本机安装${APPNAME}。$\r$\n$\r$\n笔记保存在本机，升级或卸载都不会删除。换电脑时，请在「导出同步」中导出 JSON 备份。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPNAME}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "打开${APPNAME}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}"
!define WEBVIEW2_KEY "Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

Function .onInit
  ; 法典笔记使用系统自带的 Microsoft Edge WebView2 显示页面。
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\${WEBVIEW2_KEY}" "pv"
  StrCmp $0 "" 0 found
  ReadRegStr $0 HKLM "SOFTWARE\${WEBVIEW2_KEY}" "pv"
  StrCmp $0 "" 0 found
  ReadRegStr $0 HKCU "SOFTWARE\${WEBVIEW2_KEY}" "pv"
  StrCmp $0 "" 0 found
  MessageBox MB_YESNO|MB_ICONINFORMATION "这台电脑缺少 Microsoft Edge WebView2 运行组件，法典笔记需要它显示页面。Windows 11 和更新过的 Windows 10 一般已经自带。$\r$\n$\r$\n是否打开微软官网下载？安装后请重新运行本安装程序。" IDNO done
  ExecShell "open" "https://developer.microsoft.com/microsoft-edge/webview2/"
  done:
  Abort
  found:
FunctionEnd

Section "安装"
  SetOutPath "$INSTDIR"
  File "/oname=${APPNAME}.exe" "${EXE}"
  WriteUninstaller "$INSTDIR\卸载${APPNAME}.exe"
  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${TAG}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APPNAME}.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\卸载${APPNAME}.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\${APPNAME}.exe"
  Delete "$INSTDIR\卸载${APPNAME}.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  ; 不删除 %LOCALAPPDATA%\FadianNotes：其中是使用者的笔记。
SectionEnd
