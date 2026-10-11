import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Flex, Segmented, Spin } from 'antd';
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ContractDoc, LEGAL_CSS } from '../components/ContractDoc';
import { DOC_CSS } from '../components/PrintDoc';
import { useCopyText } from '../clipboard';
import { contractUrl, type ContractForBooking } from '../contract';

/** In hợp đồng vận chuyển + danh sách hành khách của booking */
export default function ContractPage() {
  const { id } = useParams();
  const copy = useCopyText();
  const [params, setParams] = useSearchParams();
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
  // Song ngữ Việt – Anh: ?lang=bi; mặc định theo ngôn ngữ giấy tờ của booking
  const bi = params.get('lang') ? params.get('lang') === 'bi' : !!data.booking.docLanguage && data.booking.docLanguage !== 'vi';
  return (
    <>
      <style>{DOC_CSS + LEGAL_CSS}</style>
      <Flex className="toolbar" justify="center" align="center" gap={8} wrap>
        <Segmented
          value={bi ? 'bi' : 'vi'}
          onChange={(v) => setParams((p) => (p.set('lang', String(v)), p), { replace: true })}
          options={[
            { value: 'vi', label: 'Tiếng Việt' },
            { value: 'bi', label: 'Song ngữ Việt – Anh' },
          ]}
        />
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
          <ContractDoc data={data} contract={c} bi={bi} />
        </div>
      )}
    </>
  );
}
