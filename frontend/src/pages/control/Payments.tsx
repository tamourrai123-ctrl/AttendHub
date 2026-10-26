import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import PaymentsTable from "../../components/payments/PaymentsTable";
import { getPayments } from "../../api/payments";

export default function Payments() {
  return (
    <div>
      <PageHeader title="Payments" description="Payment history of every company." />
      <Card>
        <PaymentsTable fetchPage={(query) => getPayments(query)} showCompany showStatusFilter />
      </Card>
    </div>
  );
}
