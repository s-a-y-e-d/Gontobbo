import RevisionDashboard from "@/components/features/RevisionDashboard";

export default function RevisionPage() {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
        <div>
          <h1 className="font-section-heading text-section-heading text-on-surface mb-2">রিভিশন কমান্ড সেন্টার</h1>
          <p className="font-body text-body text-gray-500">আপনার আজকের রিভিশন লক্ষ্য এবং আগামী দিনের প্রস্তুতি এক নজরে।</p>
        </div>
      </div>

      <RevisionDashboard />
    </div>
  );
}
