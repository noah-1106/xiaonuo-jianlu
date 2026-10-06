import React, { useEffect, useState } from 'react'
import { Modal, Form, Input, Upload, Button, message, Space, Typography } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { profileApi, type Profile } from '../api'

const { Text } = Typography

interface Props {
  open: boolean
  onClose: () => void
}

// 个人资料设置：昵称/签名/头像/微信二维码，保存后同步到卡片主页
const ProfileSettings: React.FC<Props> = ({ open, onClose }) => {
  const [form] = Form.useForm()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    profileApi.get().then((p) => {
      setProfile(p)
      form.setFieldsValue({ nickname: p.nickname, signature: p.signature })
    }).catch(() => message.error('读取个人资料失败'))
  }, [open, form])

  const onSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const { profile: p } = await profileApi.update(values)
      setProfile(p)
      message.success('已保存，卡片下次同步时生效')
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onUpload = (kind: 'avatar' | 'qrcode') => async (file: File) => {
    try {
      if (kind === 'avatar') await profileApi.uploadAvatar(file)
      else await profileApi.uploadQrcode(file)
      message.success('已上传，卡片下次同步时生效')
      setProfile(await profileApi.get())
    } catch (e) {
      message.error(e instanceof Error ? e.message : '上传失败')
    }
    return false
  }

  return (
    <Modal title="我的资料（同步到卡片主页）" open={open} onCancel={onClose} onOk={onSave} confirmLoading={saving} okText="保存" cancelText="取消">
      <Form form={form} layout="vertical">
        <Form.Item name="nickname" label="昵称" rules={[{ max: 50 }]}>
          <Input placeholder="显示在卡片主页的名字" />
        </Form.Item>
        <Form.Item name="signature" label="签名" rules={[{ max: 100 }]}>
          <Input placeholder="一句话签名" />
        </Form.Item>
      </Form>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text strong>头像</Text>
          <Text type="secondary" style={{ marginLeft: 8 }}>{profile?.hasAvatar ? '已设置' : '未设置（卡片显示昵称首字）'}</Text>
          <Upload.Dragger accept="image/*" maxCount={1} showUploadList={false} beforeUpload={(f) => onUpload('avatar')(f)} style={{ marginTop: 8 }}>
            <p><InboxOutlined /></p>
            <p>点击或拖入头像图片（会裁切成 96×96）</p>
          </Upload.Dragger>
        </div>
        <div>
          <Text strong>微信二维码</Text>
          <Text type="secondary" style={{ marginLeft: 8 }}>{profile?.hasQrcode ? '已设置' : '未设置'}</Text>
          <Upload.Dragger accept="image/*" maxCount={1} showUploadList={false} beforeUpload={(f) => onUpload('qrcode')(f)} style={{ marginTop: 8 }}>
            <p><InboxOutlined /></p>
            <p>点击或拖入微信二维码截图（微信 → 我 → 二维码名片）</p>
          </Upload.Dragger>
        </div>
      </Space>
    </Modal>
  )
}

export default ProfileSettings
