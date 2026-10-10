import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Flex, Spin } from 'antd';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { ContractDoc, LEGAL_CSS } from '../components/ContractDoc';
import { DOC_CSS } from '../components/PrintDoc';
import { useCopyText } from '../clipboard';
import { contractUrl, type ContractForBooking } from '../contract';

/** In hợp đồng vận chuyển + danh sách hành khách của booking */
export default function ContractPage() {
  const { id } = useParams();
  const copy = useCopyText();
  const { data, isLoading } = useQuery({ queryKey: ['/contracts/booking', Number(id)], queryFn: () => api<ContractForBooking>(`/contracts/booking/${id}`) });

  useEffect(() => {
    if (data?.contract) document.title = `Hợp đồng vận chuyển ${data.contract.number.replace(/\//g, '-')} ${data.booking.code}`;
  }, [data]);

  if (isLoading || !data) {
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin size="large" />
      </Flex>
    );
  }
  const c = data.contract;
  return (
    <>
      <style>{DOC_CSS + LEGAL_CSS}</style>
      <Flex className="toolbar" justify="center" align="center" gap={8} wrap>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()} disabled={!c}>
          In / Lưu PDF
        </Button>
        {c && <Button onClick={() => copy(contractUrl(c.token), 'Đã chép đường dẫn hợp đồng điện tử')}>Chép link hợp đồng điện tử</Button>}
        <Button onClick={() => window.close()}>Đóng</Button>
      </Flex>
      {!c ? (
        <Alert style={{ maxWidth: 600, margin: '24px auto' }} type="warning" showIcon title="Booking chưa lập hợp đồng vận chuyển" description="Mở booking và bấm Hợp đồng vận chuyển để lập." />
      ) : (
        <div className="doc" lang="vi">
          <ContractDoc data={data} contract={c} />
        </div>
      )}
    </>
  );
}
