import React, { useState } from 'react'
import { Button, Tooltip } from 'antd'
import { MessageOutlined, AppstoreOutlined, SettingOutlined } from '@ant-design/icons'
import { RecordProvider } from './contexts/RecordContext'
import { RecordTypeProvider } from './contexts/RecordTypeContext'
import RecordList from './components/Record/RecordList'
import ChatPanel from './components/Chat/ChatPanel'
import ProfileSettings from './components/ProfileSettings'

const App: React.FC = () => {
  // 移动端单页切换：records（简录卡片）/ chat（聊天）；桌面端两栏同显，此状态不生效
  const [mobileView, setMobileView] = useState<'records' | 'chat'>('records')
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <RecordTypeProvider>
      <RecordProvider>
        <div className="app-root">
          {/* 顶部标题栏 */}
          <div className="app-header">
            <div className="app-title">小诺：你的个人效率助理</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tooltip title="我的资料（同步到卡片主页）">
                <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} />
              </Tooltip>
              <div className="app-view-toggle">
                <Tooltip title={mobileView === 'records' ? '切换到聊天' : '切换到简录'}>
                  <Button
                    type="text"
                    icon={mobileView === 'records' ? <MessageOutlined /> : <AppstoreOutlined />}
                    onClick={() => setMobileView(mobileView === 'records' ? 'chat' : 'records')}
                  />
                </Tooltip>
              </div>
            </div>
          </div>

          {/* 主体：桌面端左聊天右简录；移动端单页，右上角图标切换 */}
          <div className={`app-main mobile-show-${mobileView}`}>
            <div className="app-chat">
              <ChatPanel />
            </div>
            <div className="app-records">
              <RecordList />
            </div>
          </div>

          <ProfileSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
      </RecordProvider>
    </RecordTypeProvider>
  )
}

export default App
