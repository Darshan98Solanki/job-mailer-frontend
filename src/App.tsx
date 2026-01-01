import { useState, type ChangeEvent } from 'react';
import { Upload, Mail, Send, CheckCircle, XCircle, Download, FileText, Settings, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Recruiter {
  id: number;
  name: string;
  email: string;
  company: string;
  position: string;
}

interface EmailTemplate {
  subject: string;
  body: string;
}

interface EmailConfig {
  senderName: string;
  senderEmail: string;
  apiKey: string;
  service: 'sendgrid' | 'mailgun' | 'smtp';
  // SMTP specific fields
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
}

type SendStatus = 'pending' | 'sending' | 'sent' | 'failed';

interface StatusInfo {
  status: SendStatus;
  message?: string;
  timestamp?: string;
}

export default function RecruiterEmailApp() {
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [template, setTemplate] = useState<EmailTemplate>({
    subject: 'Application for {position} Position',
    body: `Dear {name},

I hope this email finds you well. I am writing to express my strong interest in the {position} position at {company}.

With my background and skills, I believe I would be a valuable addition to your team. I have attached my resume for your review.

I would welcome the opportunity to discuss how my experience aligns with your needs.

Thank you for your time and consideration.

Best regards,
[Your Name]`
  });
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    senderName: '',
    senderEmail: '',
    apiKey: '',
    service: 'sendgrid',
    // SMTP defaults
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: ''
  });
  const [selectedRecruiters, setSelectedRecruiters] = useState<number[]>([]);
  const [sendStatus, setSendStatus] = useState<Record<number, StatusInfo>>({});
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [previewRecruiter, setPreviewRecruiter] = useState<Recruiter | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt: ProgressEvent<FileReader>) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        
        const processed: Recruiter[] = jsonData.map((row: any, idx: number) => ({
          id: idx,
          name: row.Name || row.name || '',
          email: row.Email || row.email || '',
          company: row.Company || row.company || '',
          position: row.Position || row.position || ''
        }));
        
        setRecruiters(processed);
        setSelectedRecruiters(processed.map(r => r.id));
        setSendStatus({});
      } catch (error) {
        alert('Error reading file. Please ensure it\'s a valid Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadSampleExcel = (): void => {
    const sampleData = [
      { Name: 'John Smith', Email: 'john.smith@techcorp.com', Company: 'TechCorp', Position: 'Software Engineer' },
      { Name: 'Sarah Johnson', Email: 'sarah.j@innovate.com', Company: 'Innovate Inc', Position: 'Frontend Developer' },
      { Name: 'Michael Chen', Email: 'mchen@startupxyz.com', Company: 'Startup XYZ', Position: 'Full Stack Developer' }
    ];
    
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recruiters');
    XLSX.writeFile(wb, 'sample_recruiters.xlsx');
  };

  const toggleRecruiter = (id: number): void => {
    setSelectedRecruiters(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAll = (): void => {
    if (selectedRecruiters.length === recruiters.length) {
      setSelectedRecruiters([]);
    } else {
      setSelectedRecruiters(recruiters.map(r => r.id));
    }
  };

  const personalizeEmail = (text: string, recruiter: Recruiter): string => {
    return text
      .replace(/\{name\}/g, recruiter.name)
      .replace(/\{email\}/g, recruiter.email)
      .replace(/\{company\}/g, recruiter.company)
      .replace(/\{position\}/g, recruiter.position);
  };

  const previewEmail = (recruiter: Recruiter): void => {
    setPreviewRecruiter(recruiter);
    setShowPreview(true);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const sendEmailViaSendGrid = async (recruiter: Recruiter): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${emailConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: recruiter.email, name: recruiter.name }],
            subject: personalizeEmail(template.subject, recruiter)
          }],
          from: {
            email: emailConfig.senderEmail,
            name: emailConfig.senderName
          },
          content: [{
            type: 'text/plain',
            value: personalizeEmail(template.body, recruiter)
          }]
        })
      });

      if (response.ok) {
        return { success: true, message: 'Email sent successfully' };
      } else {
        const error = await response.json();
        return { success: false, message: error.errors?.[0]?.message || 'Failed to send email' };
      }
    } catch (error) {
      return { success: false, message: `Network error: ${error}` };
    }
  };

  const sendEmailViaMailgun = async (recruiter: Recruiter): Promise<{ success: boolean; message: string }> => {
    try {
      const formData = new FormData();
      formData.append('from', `${emailConfig.senderName} <${emailConfig.senderEmail}>`);
      formData.append('to', recruiter.email);
      formData.append('subject', personalizeEmail(template.subject, recruiter));
      formData.append('text', personalizeEmail(template.body, recruiter));

      // Note: You need to replace 'YOUR_DOMAIN' with your actual Mailgun domain
      const response = await fetch('https://api.mailgun.net/v3/YOUR_DOMAIN/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${emailConfig.apiKey}`)}`
        },
        body: formData
      });

      if (response.ok) {
        return { success: true, message: 'Email sent successfully' };
      } else {
        const error = await response.json();
        return { success: false, message: error.message || 'Failed to send email' };
      }
    } catch (error) {
      return { success: false, message: `Network error: ${error}` };
    }
  };

  const sendEmailViaSMTP = async (recruiter: Recruiter): Promise<{ success: boolean; message: string }> => {
    // SMTP requires a backend server since browsers can't directly connect to SMTP
    try {
      const response = await fetch('http://localhost:3001/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: recruiter.email,
          toName: recruiter.name,
          from: emailConfig.senderEmail,
          fromName: emailConfig.senderName,
          subject: personalizeEmail(template.subject, recruiter),
          body: personalizeEmail(template.body, recruiter),
          service: 'smtp',
          smtpConfig: {
            host: emailConfig.smtpHost,
            port: emailConfig.smtpPort,
            secure: emailConfig.smtpSecure,
            user: emailConfig.smtpUser,
            pass: emailConfig.smtpPass
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        return { success: true, message: result.message || 'Email sent successfully' };
      } else {
        const error = await response.json();
        return { success: false, message: error.message || 'Failed to send email' };
      }
    } catch (error) {
      return { success: false, message: `Backend error: ${error}` };
    }
  };

  const sendEmailToRecruiter = async (recruiter: Recruiter): Promise<void> => {
    setSendStatus(prev => ({
      ...prev,
      [recruiter.id]: { status: 'sending' }
    }));

    let result: { success: boolean; message: string };

    switch (emailConfig.service) {
      case 'sendgrid':
        result = await sendEmailViaSendGrid(recruiter);
        break;
      case 'mailgun':
        result = await sendEmailViaMailgun(recruiter);
        break;
      case 'smtp':
        result = await sendEmailViaSMTP(recruiter);
        break;
      default:
        result = { success: false, message: 'Invalid email service' };
    }

    setSendStatus(prev => ({
      ...prev,
      [recruiter.id]: {
        status: result.success ? 'sent' : 'failed',
        message: result.message,
        timestamp: new Date().toLocaleString()
      }
    }));
  };

  const sendEmails = async (): Promise<void> => {
    const selected = recruiters.filter(r => selectedRecruiters.includes(r.id));
    
    if (selected.length === 0) {
      alert('Please select at least one recruiter');
      return;
    }

    if (!emailConfig.senderEmail || !emailConfig.senderName) {
      alert('Please configure your sender information in Settings');
      setShowConfig(true);
      return;
    }

    if (!validateEmail(emailConfig.senderEmail)) {
      alert('Please enter a valid sender email address');
      setShowConfig(true);
      return;
    }

    if (!emailConfig.apiKey && emailConfig.service !== 'smtp') {
      alert(`Please enter your ${emailConfig.service === 'sendgrid' ? 'SendGrid' : 'Mailgun'} API key in Settings`);
      setShowConfig(true);
      return;
    }

    // Validate SMTP configuration
    if (emailConfig.service === 'smtp') {
      if (!emailConfig.smtpHost || !emailConfig.smtpUser || !emailConfig.smtpPass) {
        alert('Please configure your SMTP settings (Host, User, Password) in Settings');
        setShowConfig(true);
        return;
      }
    }

    const confirmed = window.confirm(
      `You are about to send ${selected.length} email${selected.length !== 1 ? 's' : ''} using ${emailConfig.service}. Continue?`
    );

    if (!confirmed) return;

    setIsSending(true);

    // Send emails with a delay between each to avoid rate limiting
    for (let i = 0; i < selected.length; i++) {
      await sendEmailToRecruiter(selected[i]);
      // Add a 1-second delay between emails to respect rate limits
      if (i < selected.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setIsSending(false);
    alert('Email sending completed! Check the status column for results.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Mail className="w-10 h-10 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">Recruiter Email Campaign</h1>
            </div>
            <button
              onClick={() => setShowConfig(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5" />
              Email Settings
            </button>
          </div>

          {/* File Upload Section */}
          <div className="mb-8 p-6 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border-2 border-dashed border-indigo-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
                <Upload className="w-6 h-6" />
                Upload Recruiter List
              </h2>
              <button
                onClick={downloadSampleExcel}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Sample
              </button>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 file:cursor-pointer cursor-pointer"
            />
            <p className="text-sm text-gray-600 mt-2">
              Upload an Excel file with columns: Name, Email, Company, Position
            </p>
          </div>

          {/* Email Template Section */}
          <div className="mb-8 p-6 bg-gray-50 rounded-xl">
            <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Email Template
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subject Line</label>
                <input
                  type="text"
                  value={template.subject}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTemplate({...template, subject: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Body</label>
                <textarea
                  value={template.body}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setTemplate({...template, body: e.target.value})}
                  rows={10}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                />
              </div>
              <p className="text-sm text-gray-600">
                Use placeholders: {'{name}'}, {'{email}'}, {'{company}'}, {'{position}'}
              </p>
            </div>
          </div>

          {/* Recruiters List */}
          {recruiters.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-700">
                  Recruiter List ({selectedRecruiters.length}/{recruiters.length} selected)
                </h2>
                <button
                  onClick={toggleAll}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                  disabled={isSending}
                >
                  {selectedRecruiters.length === recruiters.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-3 text-left">Select</th>
                        <th className="p-3 text-left">Name</th>
                        <th className="p-3 text-left">Email</th>
                        <th className="p-3 text-left">Company</th>
                        <th className="p-3 text-left">Position</th>
                        <th className="p-3 text-left">Status</th>
                        <th className="p-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recruiters.map((recruiter) => (
                        <tr key={recruiter.id} className="border-t border-gray-200 hover:bg-gray-50">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selectedRecruiters.includes(recruiter.id)}
                              onChange={() => toggleRecruiter(recruiter.id)}
                              disabled={isSending}
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-50"
                            />
                          </td>
                          <td className="p-3 font-medium">{recruiter.name}</td>
                          <td className="p-3 text-gray-600">{recruiter.email}</td>
                          <td className="p-3">{recruiter.company}</td>
                          <td className="p-3">{recruiter.position}</td>
                          <td className="p-3">
                            {sendStatus[recruiter.id]?.status === 'sending' && (
                              <span className="flex items-center gap-1 text-blue-600">
                                <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                              </span>
                            )}
                            {sendStatus[recruiter.id]?.status === 'sent' && (
                              <span className="flex items-center gap-1 text-green-600" title={sendStatus[recruiter.id].message}>
                                <CheckCircle className="w-4 h-4" /> Sent
                              </span>
                            )}
                            {sendStatus[recruiter.id]?.status === 'failed' && (
                              <span className="flex items-center gap-1 text-red-600" title={sendStatus[recruiter.id].message}>
                                <XCircle className="w-4 h-4" /> Failed
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => previewEmail(recruiter)}
                              disabled={isSending}
                              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium disabled:opacity-50"
                            >
                              Preview
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Send Button */}
          {recruiters.length > 0 && (
            <div className="flex justify-center">
              <button
                onClick={sendEmails}
                disabled={selectedRecruiters.length === 0 || isSending}
                className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-lg font-semibold shadow-lg"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Sending Emails...
                  </>
                ) : (
                  <>
                    <Send className="w-6 h-6" />
                    Send Emails to {selectedRecruiters.length} Recruiter{selectedRecruiters.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Email Configuration Modal */}
      {showConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6">Email Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                <input
                  type="text"
                  value={emailConfig.senderName}
                  onChange={(e) => setEmailConfig({...emailConfig, senderName: e.target.value})}
                  placeholder="John Doe"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Email</label>
                <input
                  type="email"
                  value={emailConfig.senderEmail}
                  onChange={(e) => setEmailConfig({...emailConfig, senderEmail: e.target.value})}
                  placeholder="john@example.com"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Service</label>
                <select
                  value={emailConfig.service}
                  onChange={(e) => setEmailConfig({...emailConfig, service: e.target.value as 'sendgrid' | 'mailgun' | 'smtp'})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="sendgrid">SendGrid</option>
                  <option value="mailgun">Mailgun</option>
                  <option value="smtp">Custom SMTP (Requires Backend)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {emailConfig.service === 'smtp' ? 'SMTP Configuration' : 'API Key'}
                </label>
                
                {emailConfig.service === 'smtp' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">SMTP Host</label>
                      <input
                        type="text"
                        value={emailConfig.smtpHost}
                        onChange={(e) => setEmailConfig({...emailConfig, smtpHost: e.target.value})}
                        placeholder="smtp.gmail.com"
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Port</label>
                        <input
                          type="number"
                          value={emailConfig.smtpPort}
                          onChange={(e) => setEmailConfig({...emailConfig, smtpPort: parseInt(e.target.value)})}
                          placeholder="587"
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Secure (SSL/TLS)</label>
                        <select
                          value={emailConfig.smtpSecure ? 'true' : 'false'}
                          onChange={(e) => setEmailConfig({...emailConfig, smtpSecure: e.target.value === 'true'})}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                        >
                          <option value="false">No (Port 587)</option>
                          <option value="true">Yes (Port 465)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">SMTP Username (Email)</label>
                      <input
                        type="email"
                        value={emailConfig.smtpUser}
                        onChange={(e) => setEmailConfig({...emailConfig, smtpUser: e.target.value})}
                        placeholder="your-email@gmail.com"
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">SMTP Password (App Password for Gmail)</label>
                      <input
                        type="password"
                        value={emailConfig.smtpPass}
                        onChange={(e) => setEmailConfig({...emailConfig, smtpPass: e.target.value})}
                        placeholder="Enter your app password"
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <input
                    type="password"
                    value={emailConfig.apiKey}
                    onChange={(e) => setEmailConfig({...emailConfig, apiKey: e.target.value})}
                    placeholder={`Your ${emailConfig.service === 'sendgrid' ? 'SendGrid' : 'Mailgun'} API key`}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-semibold mb-2">Setup Instructions:</p>
                {emailConfig.service === 'sendgrid' && (
                  <ul className="list-disc list-inside space-y-1">
                    <li>Sign up at sendgrid.com</li>
                    <li>Navigate to Settings → API Keys</li>
                    <li>Create a new API key with "Mail Send" permissions</li>
                    <li>Verify your sender email address</li>
                  </ul>
                )}
                {emailConfig.service === 'mailgun' && (
                  <ul className="list-disc list-inside space-y-1">
                    <li>Sign up at mailgun.com</li>
                    <li>Add and verify your domain</li>
                    <li>Get your API key from Settings → API Keys</li>
                    <li>Update the domain in the code</li>
                  </ul>
                )}
                {emailConfig.service === 'smtp' && (
                  <div className="space-y-2">
                    <p className="font-semibold">For Gmail:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>Enable 2-Factor Authentication on your Google Account</li>
                      <li>Go to Google Account → Security → 2-Step Verification</li>
                      <li>Scroll down and click "App passwords"</li>
                      <li>Select "Mail" and "Other (Custom name)"</li>
                      <li>Click Generate and copy the 16-character password</li>
                      <li>Use: Host: smtp.gmail.com, Port: 587, Secure: No</li>
                      <li>Username: your Gmail address</li>
                      <li>Password: the app password (NO SPACES)</li>
                    </ol>
                    <p className="mt-2 text-xs">⚠️ Make sure your backend API is running on port 3001</p>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowConfig(false)}
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && previewRecruiter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-4">Email Preview</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From:</label>
                <p className="text-gray-900">{emailConfig.senderName} &lt;{emailConfig.senderEmail}&gt;</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To:</label>
                <p className="text-gray-900">{previewRecruiter.name} &lt;{previewRecruiter.email}&gt;</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject:</label>
                <p className="text-gray-900 font-semibold">
                  {personalizeEmail(template.subject, previewRecruiter)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body:</label>
                <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-gray-900">
                  {personalizeEmail(template.body, previewRecruiter)}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}