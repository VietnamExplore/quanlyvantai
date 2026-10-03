import { App, Form, Input, Modal } from 'antd';
import { useState } from 'react';
import { api } from '../api';

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    let currentPassword: string, newPassword: string;
    try {
      ({ currentPassword, newPassword } = await form.validateFields());
    } catch {
      return;
    }
    setSaving(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      message.success('Đã đổi mật khẩu');
      form.resetFields();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Đổi mật khẩu" open={open} onCancel={onClose} onOk={submit} okText="Lưu" cancelText="Hủy" confirmLoading={saving} forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item name="newPassword" label="Mật khẩu mới" rules={[{ required: true, message: 'Nhập mật khẩu mới' }, { min: 6, message: 'Tối thiểu 6 ký tự' }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Nhập lại mật khẩu mới"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Nhập lại mật khẩu mới' },
            ({ getFieldValue }) => ({
              validator: (_, v) => (!v || v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu nhập lại không khớp'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
