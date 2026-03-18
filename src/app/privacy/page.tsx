import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-slate-50 p-8 flex justify-center">
      <div className="max-w-2xl w-full bg-white p-10 rounded-3xl shadow-sm border border-slate-100">
        <Link href="/" className="text-indigo-600 font-bold text-sm mb-8 inline-block hover:underline">
          ← Back to FlashKado
        </Link>
        
        <h1 className="text-3xl font-black text-slate-800 mb-6">Privacy Policy</h1>
        <p className="text-slate-500 mb-8 text-sm">Last Updated: March 2026</p>

        <section className="space-y-6 text-slate-600 leading-relaxed">
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">1. Data We Collect</h2>
            <p>
              When you sign up via Email or Facebook, we collect your <strong>email address</strong> and <strong>public profile name</strong>. 
              This is used solely to identify your account and save your flashcard progress.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">2. How We Use Data</h2>
            <p>
              Your data is used to:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Sync your Japanese vocabulary across devices.</li>
              <li>Track your study streaks and card scores.</li>
              <li>Personalize your learning experience using AI.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">3. Third-Party Services</h2>
            <p>
              We use <strong>Supabase</strong> for secure data storage and <strong>Facebook Login</strong> for authentication. 
              We do not sell your data to third parties. We use OpenAI/Anthropic APIs to generate flashcard content, 
              but no personal identifiable information is sent to these services.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">4. Data Deletion</h2>
            <p>
              You can delete your account and all associated flashcard data at any time by contacting us or using the delete 
              option in your account settings.
            </p>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Contact: [Your Email or a placeholder] if you have questions regarding your data.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}