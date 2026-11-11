; MD Reader · NSIS 自定义片段
;
; electron-builder 的 fileAssociations 会调用 APP_ASSOCIATE，但那个宏只写
;   HKCU\Software\Classes\.md (默认) = Markdown Document
; 以及 ProgId 的 shell\open\command，并不会写 OpenWithProgids，也不会注册
; Applications\<exe>\SupportedTypes —— 结果是「右键 → 打开方式 → 选择其他应用」
; 列表里找不到 MD Reader，用户没法把它设为默认程序。
; 这里补齐这两处；卸载时精确删除，不碰别的应用的项。

!macro MD_REGISTER_OPENWITH EXT
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Markdown Document" ""
  WriteRegStr HKCU "Software\Classes\Applications\MD Reader.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro MD_UNREGISTER_OPENWITH EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Markdown Document"
!macroend

!macro customInstall
  !insertmacro MD_REGISTER_OPENWITH "md"
  !insertmacro MD_REGISTER_OPENWITH "markdown"
  !insertmacro MD_REGISTER_OPENWITH "mdown"
  !insertmacro MD_REGISTER_OPENWITH "mkd"

  ; Open With 列表按「Applications\<exe>」查可执行文件路径
  WriteRegStr HKCU "Software\Classes\Applications\MD Reader.exe\shell\open\command" "" '"$INSTDIR\MD Reader.exe" "%1"'

  ; 通知资源管理器刷新图标/关联缓存
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro MD_UNREGISTER_OPENWITH "md"
  !insertmacro MD_UNREGISTER_OPENWITH "markdown"
  !insertmacro MD_UNREGISTER_OPENWITH "mdown"
  !insertmacro MD_UNREGISTER_OPENWITH "mkd"
  DeleteRegKey HKCU "Software\Classes\Applications\MD Reader.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
