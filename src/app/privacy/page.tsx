import Link from "next/link";
import { Footer } from "@/components/layout/Footer";

export const metadata = {
    title: "Privacy Policy | Blinkspot",
    description: "Learn how Blinkspot collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[#191D23] text-[#DEDCDC]">
            <div className="max-w-4xl mx-auto px-6 py-16 sm:py-24">

                {/* Back link */}
                <Link href="/" className="text-sm text-[#989DAA] hover:text-[#C5BAC4] transition-colors mb-8 inline-block">
                    &larr; Back to Home
                </Link>

                <h1 className="text-3xl sm:text-4xl font-bold text-[#C5BAC4] font-display mb-3">Privacy Policy</h1>
                <p className="text-sm text-[#57707A] font-medium mb-12">Last updated April 13, 2026</p>

                <div className="prose-legal text-sm leading-relaxed text-[#989DAA] space-y-6">

                    <p>
                        This Privacy Notice for <strong>Mubia Investment Limited</strong> (&apos;we&apos;, &apos;us&apos;, or &apos;our&apos;), describes how and why we might access, collect, store, use, and/or share (&apos;process&apos;) your personal information when you use our services (&apos;Services&apos;), including when you:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Visit our website at <a href="https://www.blinkspot.io" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io</a> or any website of ours that links to this Privacy Notice</li>
                        <li>Use <strong>Mubia Investment Limited (operating as Blinkspot)</strong>. Blinkspot is a software platform that enables users to create, manage, and schedule social media content across multiple platforms. The service includes tools for content planning, automated posting, media creation using artificial intelligence, and a built-in editor for images and videos. Users can upload and organize digital assets, define brand preferences, and generate content aligned with their brand identity.</li>
                        <li>Engage with us in other related ways, including any marketing or events</li>
                    </ul>
                    <p>
                        <strong>Questions or concerns?</strong> Reading this Privacy Notice will help you understand your privacy rights and choices. We are responsible for making decisions about how your personal information is processed. If you do not agree with our policies and practices, please do not use our Services. If you still have any questions or concerns, please contact us at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">SUMMARY OF KEY POINTS</h2>
                    <p>This summary provides key points from our Privacy Notice, but you can find out more details about any of these topics by using our table of contents below.</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>What personal information do we process?</strong> When you visit, use, or navigate our Services, we may process personal information depending on how you interact with us and the Services, the choices you make, and the products and features you use.</li>
                        <li><strong>Do we process any sensitive personal information?</strong> Some of the information may be considered &apos;special&apos; or &apos;sensitive&apos; in certain jurisdictions. We do not process sensitive personal information.</li>
                        <li><strong>Do we collect any information from third parties?</strong> We may collect information from public databases, marketing partners, social media platforms, and other outside sources.</li>
                        <li><strong>How do we process your information?</strong> We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes with your consent.</li>
                        <li><strong>In what situations and with which parties do we share personal information?</strong> We may share information in specific situations and with specific third parties.</li>
                        <li><strong>What are your rights?</strong> Depending on where you are located geographically, the applicable privacy law may mean you have certain rights regarding your personal information.</li>
                        <li><strong>How do you exercise your rights?</strong> The easiest way to exercise your rights is by visiting <Link href="/dashboard/settings" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io/dashboard/settings</Link>, or by contacting us.</li>
                    </ul>

                    {/* TABLE OF CONTENTS */}
                    <div className="bg-[#2A2F38] border border-[#57707A]/30 p-6 rounded-xl my-10">
                        <h2 className="text-lg font-bold text-[#DEDCDC] mb-4">TABLE OF CONTENTS</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[#989DAA]">
                            <p>1. WHAT INFORMATION DO WE COLLECT?</p>
                            <p>2. HOW DO WE PROCESS YOUR INFORMATION?</p>
                            <p>3. WHAT LEGAL BASES DO WE RELY ON?</p>
                            <p>4. WHEN AND WITH WHOM DO WE SHARE DATA?</p>
                            <p>5. DO WE USE COOKIES AND TRACKING TECH?</p>
                            <p>6. DO WE OFFER AI-BASED PRODUCTS?</p>
                            <p>7. HOW LONG DO WE KEEP YOUR INFORMATION?</p>
                            <p>8. DO WE COLLECT INFO FROM MINORS?</p>
                            <p>9. WHAT ARE YOUR PRIVACY RIGHTS?</p>
                            <p>10. CONTROLS FOR DO-NOT-TRACK FEATURES</p>
                            <p>11. US RESIDENTS SPECIFIC RIGHTS</p>
                            <p>12. OTHER REGIONS SPECIFIC RIGHTS</p>
                            <p>13. DO WE MAKE UPDATES TO THIS NOTICE?</p>
                            <p>14. CONTACT US ABOUT THIS NOTICE</p>
                            <p>15. REVIEW, UPDATE, OR DELETE DATA</p>
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">1. WHAT INFORMATION DO WE COLLECT?</h2>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Personal information you disclose to us</h3>
                    <p><em>In Short: We collect personal information that you provide to us.</em></p>
                    <p>We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.</p>
                    <p><strong>Personal Information Provided by You.</strong> The personal information that we collect depends on the context of your interactions with us and the Services, the choices you make, and the products and features you use. The personal information we collect may include the following:</p>
                    <ul className="list-disc pl-6 space-y-1">
                        <li>Names</li>
                        <li>Phone numbers</li>
                        <li>Email addresses</li>
                        <li>Usernames</li>
                        <li>Contact preferences</li>
                        <li>Job titles</li>
                    </ul>
                    <p><strong>Sensitive Information.</strong> We do not process sensitive information.</p>
                    <p><strong>Payment Data.</strong> We may collect data necessary to process your payment if you choose to make purchases, such as your payment instrument number, and the security code associated with your payment instrument. All payment data is handled and stored by Platnova. You may find their privacy notice here: <a href="https://platnova.com/privacy-policy" className="text-[#C5BAC4] hover:underline" target="_blank" rel="noopener noreferrer">https://platnova.com/privacy-policy</a>.</p>
                    <p>All personal information that you provide to us must be true, complete, and accurate, and you must notify us of any changes to such personal information.</p>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Information automatically collected</h3>
                    <p><em>In Short: Some information — such as your Internet Protocol (IP) address and/or browser and device characteristics — is collected automatically when you visit our Services.</em></p>
                    <p>We automatically collect certain information when you visit, use, or navigate the Services. This information does not reveal your specific identity (like your name or contact information) but may include device and usage information, such as your IP address, browser and device characteristics, operating system, language preferences, referring URLs, device name, country, location, information about how and when you use our Services, and other technical information. This information is primarily needed to maintain the security and operation of our Services, and for our internal analytics and reporting purposes.</p>
                    <p>Like many businesses, we also collect information through cookies and similar technologies.</p>
                    <p>The information we collect includes:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Log and Usage Data.</strong> Log and usage data is service-related, diagnostic, usage, and performance information our servers automatically collect when you access or use our Services and which we record in log files. Depending on how you interact with us, this log data may include your IP address, device information, browser type, and settings and information about your activity in the Services (such as the date/time stamps associated with your usage, pages and files viewed, searches, and other actions you take such as which features you use), device event information (such as system activity, error reports, and hardware settings).</li>
                        <li><strong>Device Data.</strong> We collect device data such as information about your computer, phone, tablet, or other device you use to access the Services. Depending on the device used, this device data may include information such as your IP address (or proxy server), device and application identification numbers, location, browser type, hardware model, Internet service provider and/or mobile carrier, operating system, and system configuration information.</li>
                    </ul>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Google API</h3>
                    <p>Our use of information received from Google APIs will adhere to Google API Services User Data Policy, including the Limited Use requirements.</p>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Information collected from other sources</h3>
                    <p><em>In Short: We may collect limited data from public databases, marketing partners, and other outside sources.</em></p>
                    <p>In order to enhance our ability to provide relevant marketing, offers, and services to you and update our records, we may obtain information about you from other sources, such as public databases, joint marketing partners, affiliate programs, data providers, and from other third parties. This information includes mailing addresses, job titles, email addresses, phone numbers, intent data (or user behaviour data), Internet Protocol (IP) addresses, social media profiles, social media URLs, and custom profiles, for purposes of targeted advertising and event promotion.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">2. HOW DO WE PROCESS YOUR INFORMATION?</h2>
                    <p><em>In Short: We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes only with your prior explicit consent.</em></p>
                    <p>We process your personal information for a variety of reasons, depending on how you interact with our Services, including:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>To facilitate account creation and authentication and otherwise manage user accounts.</li>
                        <li>To deliver and facilitate delivery of services to the user.</li>
                        <li>To respond to user inquiries/offer support to users.</li>
                        <li>To send administrative information to you.</li>
                        <li>To fulfil and manage your orders, payments, returns, and exchanges.</li>
                        <li>To request feedback.</li>
                        <li>To send you marketing and promotional communications (if in accordance with your marketing preferences).</li>
                        <li>To protect our Services, including fraud monitoring and prevention.</li>
                        <li>To identify usage trends.</li>
                        <li>To determine the effectiveness of our marketing and promotional campaigns.</li>
                        <li>To save or protect an individual&apos;s vital interest, such as to prevent harm.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">3. WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR INFORMATION?</h2>
                    <p><em>In Short: We only process your personal information when we believe it is necessary and we have a valid legal reason (i.e. legal basis) to do so under applicable law.</em></p>
                    <p><strong>If you are located in the EU or UK, this section applies to you.</strong></p>
                    <p>The General Data Protection Regulation (GDPR) and UK GDPR require us to explain the valid legal bases we rely on in order to process your personal information. As such, we may rely on the following legal bases:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Consent.</strong> We may process your information if you have given us permission (i.e. consent) to use your personal information for a specific purpose. You can withdraw your consent at any time.</li>
                        <li><strong>Performance of a Contract.</strong> We may process your personal information when we believe it is necessary to fulfil our contractual obligations to you.</li>
                        <li><strong>Legitimate Interests.</strong> We may process your information when we believe it is reasonably necessary to achieve our legitimate business interests and those interests do not outweigh your interests and fundamental rights and freedoms.</li>
                        <li><strong>Legal Obligations.</strong> We may process your information where we believe it is necessary for compliance with our legal obligations.</li>
                        <li><strong>Vital Interests.</strong> We may process your information where we believe it is necessary to protect your vital interests or the vital interests of a third party.</li>
                    </ul>

                    <p><strong>If you are located in Canada, this section applies to you.</strong></p>
                    <p>We may process your information if you have given us specific permission (express consent) or in situations where your permission can be inferred (implied consent). You can withdraw your consent at any time. In some exceptional cases, we may be legally permitted under applicable law to process your information without your consent, such as for fraud detection, legal subpoenas, or investigating a breach of an agreement.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</h2>
                    <p>We may need to share your personal information in the following situations:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Business Transfers.</strong> We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.</li>
                        <li><strong>Affiliates.</strong> We may share your information with our affiliates, in which case we will require those affiliates to honour this Privacy Notice.</li>
                        <li><strong>Business Partners.</strong> We may share your information with our business partners to offer you certain products, services, or promotions.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">5. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?</h2>
                    <p>We may use cookies and similar tracking technologies (like web beacons and pixels) to gather information when you interact with our Services. Some online tracking technologies help us maintain the security of our Services and your account, prevent crashes, fix bugs, save your preferences, and assist with basic site functions.</p>
                    <p><strong>Google Analytics:</strong> We may share your information with Google Analytics to track and analyse the use of the Services. To opt out of being tracked by Google Analytics across the Services, visit <a href="https://tools.google.com/dlpage/gaoptout" className="text-[#C5BAC4] hover:underline" target="_blank" rel="noopener noreferrer">https://tools.google.com/dlpage/gaoptout</a>.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">6. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?</h2>
                    <p>As part of our Services, we offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies (collectively, &apos;AI Products&apos;). These tools are designed to enhance your experience and provide you with innovative solutions.</p>
                    <p><strong>Use of AI Technologies:</strong> We provide the AI Products through third-party service providers (&apos;AI Service Providers&apos;), including OpenAI, Google Cloud AI, Alibaba Cloud AI and Anthropic. As outlined in this Privacy Notice, your input, output, and personal information will be shared with and processed by these AI Service Providers. You must not use the AI Products in any way that violates the terms or policies of any AI Service Provider.</p>
                    <p><strong>Our AI Products are designed for:</strong> Video generation, Text analysis, AI automation, AI predictive analytics, Image analysis, Image generation, Natural language processing, Video analysis, and AI research.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">7. HOW LONG DO WE KEEP YOUR INFORMATION?</h2>
                    <p>We will only keep your personal information for as long as it is necessary for the purposes set out in this Privacy Notice, unless a longer retention period is required or permitted by law. No purpose in this notice will require us keeping your personal information for longer than the period of time in which users have an account with us. When we have no ongoing legitimate business need to process your personal information, we will either delete or anonymise such information.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">8. DO WE COLLECT INFORMATION FROM MINORS?</h2>
                    <p>We do not knowingly collect, solicit data from, or market to children under 18 years of age. By using the Services, you represent that you are at least 18 or that you are the parent or guardian of such a minor and consent to such minor dependent&apos;s use of the Services. If we learn that personal information from users less than 18 years of age has been collected, we will deactivate the account and delete such data. Please contact us at info@blinkspot.io if you become aware of any data collected from children.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">9. WHAT ARE YOUR PRIVACY RIGHTS?</h2>
                    <p>In some regions (like the EEA, UK, Switzerland, and Canada), you have certain rights under applicable data protection laws. These may include the right (i) to request access and obtain a copy of your personal information, (ii) to request rectification or erasure; (iii) to restrict the processing of your personal information; (iv) if applicable, to data portability; and (v) not to be subject to automated decision-making.</p>
                    <p><strong>Withdrawing your consent:</strong> You have the right to withdraw your consent to data processing at any time.</p>
                    <p><strong>Account Information:</strong> If you would at any time like to review or change the information in your account or terminate your account, you can log in to your account settings and update your user account. Upon your request to terminate your account, we will deactivate or delete your account and information from our active databases.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">10. CONTROLS FOR DO-NOT-TRACK FEATURES</h2>
                    <p>Most web browsers and some mobile operating systems include a Do-Not-Track (&apos;DNT&apos;) feature or setting you can activate to signal your privacy preference not to have data about your online browsing activities monitored and collected. We do not currently respond to DNT browser signals or any other mechanism that automatically communicates your choice not to be tracked online.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">11. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</h2>
                    <p>If you are a resident of California, Colorado, Connecticut, Delaware, Florida, Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island, Tennessee, Texas, Utah, or Virginia, you may have the right to request access to and receive details about the personal information we maintain about you and how we have processed it, correct inaccuracies, get a copy of, or delete your personal information.</p>

                    <div className="overflow-x-auto mt-6 mb-8">
                        <table className="w-full text-left border-collapse border border-[#57707A]/30">
                            <thead>
                                <tr className="bg-[#2A2F38]">
                                    <th className="p-3 border border-[#57707A]/30 text-[#DEDCDC]">Category</th>
                                    <th className="p-3 border border-[#57707A]/30 text-[#DEDCDC]">Collected</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">A. Identifiers (Contact details, IP, etc.)</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">B. Personal info (Name, employment, financial)</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">C. Protected classification characteristics</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">D. Commercial information (Transaction history)</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">E. Biometric information</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">F. Internet/network activity (Browsing history)</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">G. Geolocation data</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">H. Audio, electronic, sensory information</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">I. Professional or employment-related info</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">J. Education Information</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                                <tr className="bg-[#2A2F38]/30">
                                    <td className="p-3 border border-[#57707A]/30 font-bold text-[#DEDCDC]">K. Inferences drawn from collected personal information</td>
                                    <td className="p-3 border border-[#57707A]/30 font-bold text-center text-[#C5BAC4]">YES</td>
                                </tr>
                                <tr>
                                    <td className="p-3 border border-[#57707A]/30">L. Sensitive personal Information</td>
                                    <td className="p-3 border border-[#57707A]/30 text-center text-[#C5BAC4]">NO</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <p>We will use and retain the collected personal information for Category K as long as the user has an account with us. We have not disclosed, sold, or shared any personal information to third parties for a business or commercial purpose in the preceding twelve (12) months.</p>

                    <p><strong>How to Exercise Your Rights:</strong> To exercise these rights, you can contact us by visiting <Link href="/dashboard/settings" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io/dashboard/settings</Link> or by emailing us at info@blinkspot.io.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">12. DO OTHER REGIONS HAVE SPECIFIC PRIVACY RIGHTS?</h2>
                    <p><strong>Australia and New Zealand:</strong> We collect and process your personal information under the obligations and conditions set by Australia&apos;s Privacy Act 1988 and New Zealand&apos;s Privacy Act 2020. At any time, you have the right to request access to or correction of your personal information.</p>
                    <p><strong>Republic of South Africa:</strong> At any time, you have the right to request access to or correction of your personal information.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">13. DO WE MAKE UPDATES TO THIS NOTICE?</h2>
                    <p>Yes, we will update this notice as necessary to stay compliant with relevant laws. We may update this Privacy Notice from time to time. The updated version will be indicated by an updated &apos;Revised&apos; date at the top of this Privacy Notice.</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">14. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</h2>
                    <p>If you have questions or comments about this notice, you may email us at info@blinkspot.io or contact us by post at:</p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">15. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</h2>
                    <p>Based on the applicable laws of your country or state of residence, you may have the right to request access to the personal information we collect from you, details about how we have processed it, correct inaccuracies, or delete your personal information. To request to review, update, or delete your personal information, please visit: <Link href="/dashboard/settings" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io/dashboard/settings</Link>.</p>
                </div>

                {/* Corporate Shield Contact Block */}
                <div className="mt-12 p-6 bg-[#2A2F38] border border-[#57707A]/30 rounded-xl">
                    <p className="text-[#DEDCDC] font-medium mb-2">Legal Contact Information</p>
                    <p className="text-sm">
                        Registered Entity: <span className="text-[#DEDCDC]">Mubia Investment Limited</span>
                    </p>
                    <p className="text-sm mt-1 text-[#989DAA]">
                        P.O. Box 621 - G.P.O<br />
                        Nairobi 00100<br />
                        Kenya
                    </p>
                    <p className="text-sm mt-4">
                        Email: <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>
                    </p>
                </div>
            </div>
            <Footer />
        </div>
    );
}