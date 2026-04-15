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
                <Link href="/" className="text-sm text-[#989DAA] hover:text-[#C5BAC4] transition-colors mb-8 inline-block">&larr; Back to Home</Link>

                <h1 className="text-3xl sm:text-4xl font-bold text-[#C5BAC4] font-display mb-3">Privacy Policy</h1>
                <p className="text-sm text-[#57707A] font-medium mb-12">Last updated April 13, 2026</p>

                <div className="prose-legal space-y-8 text-sm leading-relaxed text-[#989DAA]">

                    {/* ─── INTRO ─── */}
                    <p>
                        This Privacy Notice for <strong className="text-[#DEDCDC]">blinkspot</strong> (&lsquo;<strong className="text-[#DEDCDC]">we</strong>&rsquo;, &lsquo;<strong className="text-[#DEDCDC]">us</strong>&rsquo;, or &lsquo;<strong className="text-[#DEDCDC]">our</strong>&rsquo;), describes how and why we might access, collect, store, use, and/or share (&lsquo;<strong className="text-[#DEDCDC]">process</strong>&rsquo;) your personal information when you use our services (&lsquo;<strong className="text-[#DEDCDC]">Services</strong>&rsquo;), including when you:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Visit our website at <a href="https://www.blinkspot.io" target="_blank" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io</a> or any website of ours that links to this Privacy Notice</li>
                        <li>Use <strong className="text-[#DEDCDC]">Blinkspot</strong> (operated by Freddy Chineme as a sole proprietor). Blinkspot is a software platform that enables users to create, manage, and schedule social media content across multiple platforms. The service includes tools for content planning, automated posting, media creation using artificial intelligence, and a built-in editor for images and videos. Users can upload and organize digital assets, define brand preferences, and generate content aligned with their brand identity.</li>
                        <li>Engage with us in other related ways, including any marketing or events</li>
                    </ul>
                    <p>
                        <strong className="text-[#DEDCDC]">Questions or concerns?</strong> Reading this Privacy Notice will help you understand your privacy rights and choices. We are responsible for making decisions about how your personal information is processed. If you do not agree with our policies and practices, please do not use our Services. If you still have any questions or concerns, please contact us at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>.
                    </p>

                    {/* ─── SUMMARY OF KEY POINTS ─── */}
                    <h2 className="text-xl font-bold text-[#C5BAC4] pt-6">Summary of Key Points</h2>
                    <p className="italic">This summary provides key points from our Privacy Notice, but you can find out more details about any of these topics by using the table of contents below.</p>
                    <ul className="list-disc pl-6 space-y-3">
                        <li><strong className="text-[#DEDCDC]">What personal information do we process?</strong> When you visit, use, or navigate our Services, we may process personal information depending on how you interact with us and the Services, the choices you make, and the products and features you use.</li>
                        <li><strong className="text-[#DEDCDC]">Do we process any sensitive personal information?</strong> We do not process sensitive personal information.</li>
                        <li><strong className="text-[#DEDCDC]">Do we collect any information from third parties?</strong> We may collect information from public databases, marketing partners, social media platforms, and other outside sources.</li>
                        <li><strong className="text-[#DEDCDC]">How do we process your information?</strong> We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes with your consent.</li>
                        <li><strong className="text-[#DEDCDC]">In what situations and with which parties do we share personal information?</strong> We may share information in specific situations and with specific third parties.</li>
                        <li><strong className="text-[#DEDCDC]">What are your rights?</strong> Depending on where you are located geographically, the applicable privacy law may mean you have certain rights regarding your personal information.</li>
                        <li><strong className="text-[#DEDCDC]">How do you exercise your rights?</strong> The easiest way to exercise your rights is by submitting a <a href="https://app.termly.io/dsar/16f5e918-d59f-4a62-af3f-bb496ee07a4e" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">data subject access request</a>, or by contacting us.</li>
                    </ul>

                    {/* ─── TABLE OF CONTENTS ─── */}
                    <h2 className="text-xl font-bold text-[#C5BAC4] pt-6">Table of Contents</h2>
                    <ol className="list-decimal pl-6 space-y-1">
                        <li><a href="#info-collect" className="text-[#C5BAC4] hover:underline">What Information Do We Collect?</a></li>
                        <li><a href="#info-use" className="text-[#C5BAC4] hover:underline">How Do We Process Your Information?</a></li>
                        <li><a href="#legal-bases" className="text-[#C5BAC4] hover:underline">What Legal Bases Do We Rely On to Process Your Personal Information?</a></li>
                        <li><a href="#who-share" className="text-[#C5BAC4] hover:underline">When and With Whom Do We Share Your Personal Information?</a></li>
                        <li><a href="#cookies" className="text-[#C5BAC4] hover:underline">Do We Use Cookies and Other Tracking Technologies?</a></li>
                        <li><a href="#ai" className="text-[#C5BAC4] hover:underline">Do We Offer Artificial Intelligence-Based Products?</a></li>
                        <li><a href="#info-retain" className="text-[#C5BAC4] hover:underline">How Long Do We Keep Your Information?</a></li>
                        <li><a href="#info-minors" className="text-[#C5BAC4] hover:underline">Do We Collect Information From Minors?</a></li>
                        <li><a href="#privacy-rights" className="text-[#C5BAC4] hover:underline">What Are Your Privacy Rights?</a></li>
                        <li><a href="#dnt" className="text-[#C5BAC4] hover:underline">Controls for Do-Not-Track Features</a></li>
                        <li><a href="#us-laws" className="text-[#C5BAC4] hover:underline">Do United States Residents Have Specific Privacy Rights?</a></li>
                        <li><a href="#other-laws" className="text-[#C5BAC4] hover:underline">Do Other Regions Have Specific Privacy Rights?</a></li>
                        <li><a href="#policy-updates" className="text-[#C5BAC4] hover:underline">Do We Make Updates to This Notice?</a></li>
                        <li><a href="#contact" className="text-[#C5BAC4] hover:underline">How Can You Contact Us About This Notice?</a></li>
                        <li><a href="#request" className="text-[#C5BAC4] hover:underline">How Can You Review, Update, or Delete the Data We Collect From You?</a></li>
                    </ol>

                    {/* ─── 1. WHAT INFORMATION DO WE COLLECT? ─── */}
                    <h2 id="info-collect" className="text-xl font-bold text-[#C5BAC4] pt-6">1. What Information Do We Collect?</h2>
                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Personal information you disclose to us</h3>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> We collect personal information that you provide to us.</em></p>
                    <p>We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.</p>
                    <p><strong className="text-[#DEDCDC]">Personal Information Provided by You.</strong> The personal information that we collect depends on the context of your interactions with us and the Services, the choices you make, and the products and features you use. The personal information we collect may include the following:</p>
                    <ul className="list-disc pl-6 space-y-1">
                        <li>Names</li>
                        <li>Phone numbers</li>
                        <li>Email addresses</li>
                        <li>Usernames</li>
                        <li>Contact preferences</li>
                    </ul>
                    <p><strong className="text-[#DEDCDC]">Sensitive Information.</strong> We do not process sensitive information.</p>
                    <p><strong className="text-[#DEDCDC]">Payment Data.</strong> We may collect data necessary to process your payment if you choose to make purchases, such as your payment instrument number, and the security code associated with your payment instrument. All payment data is handled and stored by <strong className="text-[#DEDCDC]">Platnova</strong>. You may find their privacy notice here: <a href="https://platnova.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">https://platnova.com/privacy-policy</a>.</p>
                    <p>All personal information that you provide to us must be true, complete, and accurate, and you must notify us of any changes to such personal information.</p>

                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Information automatically collected</h3>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> Some information — such as your Internet Protocol (IP) address and/or browser and device characteristics — is collected automatically when you visit our Services.</em></p>
                    <p>We automatically collect certain information when you visit, use, or navigate the Services. This information does not reveal your specific identity (like your name or contact information) but may include device and usage information, such as your IP address, browser and device characteristics, operating system, language preferences, referring URLs, device name, country, location, information about how and when you use our Services, and other technical information. This information is primarily needed to maintain the security and operation of our Services, and for our internal analytics and reporting purposes.</p>
                    <p>Like many businesses, we also collect information through cookies and similar technologies.</p>
                    <p>The information we collect includes:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><em>Log and Usage Data.</em> Log and usage data is service-related, diagnostic, usage, and performance information our servers automatically collect when you access or use our Services and which we record in log files. This log data may include your IP address, device information, browser type, and settings and information about your activity in the Services (such as the date/time stamps associated with your usage, pages and files viewed, searches, and other actions you take), device event information (such as system activity, error reports, and hardware settings).</li>
                        <li><em>Device Data.</em> We collect device data such as information about your computer, phone, tablet, or other device you use to access the Services. Depending on the device used, this device data may include information such as your IP address (or proxy server), device and application identification numbers, location, browser type, hardware model, Internet service provider and/or mobile carrier, operating system, and system configuration information.</li>
                    </ul>

                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Google API</h3>
                    <p>Our use of information received from Google APIs will adhere to <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">Google API Services User Data Policy</a>, including the <a href="https://developers.google.com/terms/api-services-user-data-policy#limited-use" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">Limited Use requirements</a>.</p>

                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Information collected from other sources</h3>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> We may collect limited data from public databases, marketing partners, and other outside sources.</em></p>
                    <p>In order to enhance our ability to provide relevant marketing, offers, and services to you and update our records, we may obtain information about you from other sources, such as public databases, joint marketing partners, affiliate programs, data providers, and from other third parties. This information includes mailing addresses, job titles, email addresses, phone numbers, intent data (or user behaviour data), Internet Protocol (IP) addresses, social media profiles, social media URLs, and custom profiles, for purposes of targeted advertising and event promotion.</p>

                    {/* ─── 2. HOW DO WE PROCESS YOUR INFORMATION? ─── */}
                    <h2 id="info-use" className="text-xl font-bold text-[#C5BAC4] pt-6">2. How Do We Process Your Information?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes only with your prior explicit consent.</em></p>
                    <p><strong className="text-[#DEDCDC]">We process your personal information for a variety of reasons, depending on how you interact with our Services, including:</strong></p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong className="text-[#DEDCDC]">To facilitate account creation and authentication and otherwise manage user accounts.</strong> We may process your information so you can create and log in to your account, as well as keep your account in working order.</li>
                        <li><strong className="text-[#DEDCDC]">To deliver and facilitate delivery of services to the user.</strong> We may process your information to provide you with the requested service.</li>
                        <li><strong className="text-[#DEDCDC]">To respond to user inquiries/offer support to users.</strong> We may process your information to respond to your inquiries and solve any potential issues you might have with the requested service.</li>
                        <li><strong className="text-[#DEDCDC]">To send administrative information to you.</strong> We may process your information to send you details about our products and services, changes to our terms and policies, and other similar information.</li>
                        <li><strong className="text-[#DEDCDC]">To fulfil and manage your orders.</strong> We may process your information to fulfil and manage your orders, payments, returns, and exchanges made through the Services.</li>
                        <li><strong className="text-[#DEDCDC]">To request feedback.</strong> We may process your information when necessary to request feedback and to contact you about your use of our Services.</li>
                        <li><strong className="text-[#DEDCDC]">To send you marketing and promotional communications.</strong> We may process the personal information you send to us for our marketing purposes, if this is in accordance with your marketing preferences. You can opt out of our marketing emails at any time.</li>
                        <li><strong className="text-[#DEDCDC]">To protect our Services.</strong> We may process your information as part of our efforts to keep our Services safe and secure, including fraud monitoring and prevention.</li>
                        <li><strong className="text-[#DEDCDC]">To identify usage trends.</strong> We may process information about how you use our Services to better understand how they are being used so we can improve them.</li>
                        <li><strong className="text-[#DEDCDC]">To determine the effectiveness of our marketing and promotional campaigns.</strong> We may process your information to better understand how to provide marketing and promotional campaigns that are most relevant to you.</li>
                        <li><strong className="text-[#DEDCDC]">To save or protect an individual&apos;s vital interest.</strong> We may process your information when necessary to save or protect an individual&apos;s vital interest, such as to prevent harm.</li>
                    </ul>

                    {/* ─── 3. LEGAL BASES ─── */}
                    <h2 id="legal-bases" className="text-xl font-bold text-[#C5BAC4] pt-6">3. What Legal Bases Do We Rely On to Process Your Information?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> We only process your personal information when we believe it is necessary and we have a valid legal reason (i.e. legal basis) to do so under applicable law, like with your consent, to comply with laws, to provide you with services to enter into or fulfil our contractual obligations, to protect your rights, or to fulfil our legitimate business interests.</em></p>
                    <p className="italic font-semibold text-[#DEDCDC]">If you are located in the EU or UK, this section applies to you.</p>
                    <p>The General Data Protection Regulation (GDPR) and UK GDPR require us to explain the valid legal bases we rely on in order to process your personal information. As such, we may rely on the following legal bases:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong className="text-[#DEDCDC]">Consent.</strong> We may process your information if you have given us permission (i.e. consent) to use your personal information for a specific purpose. You can withdraw your consent at any time.</li>
                        <li><strong className="text-[#DEDCDC]">Performance of a Contract.</strong> We may process your personal information when we believe it is necessary to fulfil our contractual obligations to you, including providing our Services or at your request prior to entering into a contract with you.</li>
                        <li><strong className="text-[#DEDCDC]">Legitimate Interests.</strong> We may process your information when we believe it is reasonably necessary to achieve our legitimate business interests and those interests do not outweigh your interests and fundamental rights and freedoms. For example, we may process your personal information to:
                            <ul className="list-disc pl-6 mt-2 space-y-1">
                                <li>Send users information about special offers and discounts on our products and services</li>
                                <li>Analyse how our Services are used so we can improve them to engage and retain users</li>
                                <li>Support our marketing activities</li>
                                <li>Diagnose problems and/or prevent fraudulent activities</li>
                                <li>Understand how our users use our products and services so we can improve user experience</li>
                            </ul>
                        </li>
                        <li><strong className="text-[#DEDCDC]">Legal Obligations.</strong> We may process your information where we believe it is necessary for compliance with our legal obligations, such as to cooperate with a law enforcement body or regulatory agency, exercise or defend our legal rights, or disclose your information as evidence in litigation in which we are involved.</li>
                        <li><strong className="text-[#DEDCDC]">Vital Interests.</strong> We may process your information where we believe it is necessary to protect your vital interests or the vital interests of a third party, such as situations involving potential threats to the safety of any person.</li>
                    </ul>
                    <p className="italic font-semibold text-[#DEDCDC] pt-4">If you are located in Canada, this section applies to you.</p>
                    <p>We may process your information if you have given us specific permission (i.e. express consent) to use your personal information for a specific purpose, or in situations where your permission can be inferred (i.e. implied consent). You can withdraw your consent at any time.</p>
                    <p>In some exceptional cases, we may be legally permitted under applicable law to process your information without your consent, including, for example:</p>
                    <ul className="list-disc pl-6 space-y-1">
                        <li>If collection is clearly in the interests of an individual and consent cannot be obtained in a timely way</li>
                        <li>For investigations and fraud detection and prevention</li>
                        <li>For business transactions provided certain conditions are met</li>
                        <li>If it is contained in a witness statement and the collection is necessary to assess, process, or settle an insurance claim</li>
                        <li>For identifying injured, ill, or deceased persons and communicating with next of kin</li>
                        <li>If we have reasonable grounds to believe an individual has been, is, or may be victim of financial abuse</li>
                        <li>If it is reasonable to expect collection and use with consent would compromise the availability or the accuracy of the information and the collection is reasonable for purposes related to investigating a breach of an agreement or a contravention of the laws of Canada or a province</li>
                        <li>If disclosure is required to comply with a subpoena, warrant, court order, or rules of the court relating to the production of records</li>
                        <li>If it was produced by an individual in the course of their employment, business, or profession and the collection is consistent with the purposes for which the information was produced</li>
                        <li>If the collection is solely for journalistic, artistic, or literary purposes</li>
                        <li>If the information is publicly available and is specified by the regulations</li>
                        <li>We may disclose de-identified information for approved research or statistics projects, subject to ethics oversight and confidentiality commitments</li>
                    </ul>

                    {/* ─── 4. WHO WE SHARE WITH ─── */}
                    <h2 id="who-share" className="text-xl font-bold text-[#C5BAC4] pt-6">4. When and With Whom Do We Share Your Personal Information?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> We may share information in specific situations described in this section and/or with the following third parties.</em></p>
                    <p>We may need to share your personal information in the following situations:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong className="text-[#DEDCDC]">Business Transfers.</strong> We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.</li>
                        <li><strong className="text-[#DEDCDC]">Affiliates.</strong> We may share your information with our affiliates, in which case we will require those affiliates to honour this Privacy Notice. Affiliates include our parent company and any subsidiaries, joint venture partners, or other companies that we control or that are under common control with us.</li>
                        <li><strong className="text-[#DEDCDC]">Business Partners.</strong> We may share your information with our business partners to offer you certain products, services, or promotions.</li>
                    </ul>

                    {/* ─── 5. COOKIES ─── */}
                    <h2 id="cookies" className="text-xl font-bold text-[#C5BAC4] pt-6">5. Do We Use Cookies and Other Tracking Technologies?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> We may use cookies and other tracking technologies to collect and store your information.</em></p>
                    <p>We may use cookies and similar tracking technologies (like web beacons and pixels) to gather information when you interact with our Services. Some online tracking technologies help us maintain the security of our Services and your account, prevent crashes, fix bugs, save your preferences, and assist with basic site functions.</p>
                    <p>We also permit third parties and service providers to use online tracking technologies on our Services for analytics and advertising, including to help manage and display advertisements, to tailor advertisements to your interests, or to send abandoned shopping cart reminders (depending on your communication preferences). The third parties and service providers use their technology to provide advertising about products and services tailored to your interests which may appear either on our Services or on other websites.</p>
                    <p>Specific information about how we use such technologies and how you can refuse certain cookies is set out in our Cookie Notice.</p>
                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Google Analytics</h3>
                    <p>We may share your information with Google Analytics to track and analyse the use of the Services. To opt out of being tracked by Google Analytics across the Services, visit <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">https://tools.google.com/dlpage/gaoptout</a>. For more information on the privacy practices of Google, please visit the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">Google Privacy &amp; Terms page</a>.</p>

                    {/* ─── 6. AI PRODUCTS ─── */}
                    <h2 id="ai" className="text-xl font-bold text-[#C5BAC4] pt-6">6. Do We Offer Artificial Intelligence-Based Products?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> We offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies.</em></p>
                    <p>As part of our Services, we offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies (collectively, &lsquo;AI Products&rsquo;). These tools are designed to enhance your experience and provide you with innovative solutions. The terms in this Privacy Notice govern your use of the AI Products within our Services.</p>
                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Use of AI Technologies</h3>
                    <p>We provide the AI Products through third-party service providers (&lsquo;AI Service Providers&rsquo;), including <strong className="text-[#DEDCDC]">OpenAI</strong>, <strong className="text-[#DEDCDC]">Google Cloud AI</strong>, <strong className="text-[#DEDCDC]">Alibaba Cloud AI</strong>, and <strong className="text-[#DEDCDC]">Anthropic</strong>. As outlined in this Privacy Notice, your input, output, and personal information will be shared with and processed by these AI Service Providers to enable your use of our AI Products. You must not use the AI Products in any way that violates the terms or policies of any AI Service Provider.</p>
                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Our AI Products</h3>
                    <p>Our AI Products are designed for the following functions:</p>
                    <ul className="list-disc pl-6 space-y-1">
                        <li>Video generation</li>
                        <li>Text analysis</li>
                        <li>AI automation</li>
                        <li>AI predictive analytics</li>
                        <li>Image analysis</li>
                        <li>Image generation</li>
                        <li>Natural language processing</li>
                        <li>Video analysis</li>
                        <li>AI research</li>
                    </ul>
                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">How We Process Your Data Using AI</h3>
                    <p>All personal information processed using our AI Products is handled in line with our Privacy Notice and our agreement with third parties. This ensures high security and safeguards your personal information throughout the process, giving you peace of mind about your data&apos;s safety.</p>

                    {/* ─── 7. RETENTION ─── */}
                    <h2 id="info-retain" className="text-xl font-bold text-[#C5BAC4] pt-6">7. How Long Do We Keep Your Information?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> We keep your information for as long as necessary to fulfil the purposes outlined in this Privacy Notice unless otherwise required by law.</em></p>
                    <p>We will only keep your personal information for as long as it is necessary for the purposes set out in this Privacy Notice, unless a longer retention period is required or permitted by law (such as tax, accounting, or other legal requirements). No purpose in this notice will require us keeping your personal information for longer than the period of time in which users have an account with us.</p>
                    <p>When we have no ongoing legitimate business need to process your personal information, we will either delete or anonymise such information, or, if this is not possible (for example, because your personal information has been stored in backup archives), then we will securely store your personal information and isolate it from any further processing until deletion is possible.</p>

                    {/* ─── 8. MINORS ─── */}
                    <h2 id="info-minors" className="text-xl font-bold text-[#C5BAC4] pt-6">8. Do We Collect Information From Minors?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> We do not knowingly collect data from or market to children under 18 years of age or the equivalent age as specified by law in your jurisdiction.</em></p>
                    <p>We do not knowingly collect, solicit data from, or market to children under 18 years of age or the equivalent age as specified by law in your jurisdiction, nor do we knowingly sell such personal information. By using the Services, you represent that you are at least 18 or the equivalent age as specified by law in your jurisdiction or that you are the parent or guardian of such a minor and consent to such minor dependent&apos;s use of the Services. If we learn that personal information from users less than 18 years of age has been collected, we will deactivate the account and take reasonable measures to promptly delete such data from our records. If you become aware of any data we may have collected from children under age 18, please contact us at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>.</p>

                    {/* ─── 9. PRIVACY RIGHTS ─── */}
                    <h2 id="privacy-rights" className="text-xl font-bold text-[#C5BAC4] pt-6">9. What Are Your Privacy Rights?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> Depending on your state of residence in the US or in some regions, such as the European Economic Area (EEA), United Kingdom (UK), Switzerland, and Canada, you have rights that allow you greater access to and control over your personal information. You may review, change, or terminate your account at any time, depending on your country, province, or state of residence.</em></p>
                    <p>In some regions (like the EEA, UK, Switzerland, and Canada), you have certain rights under applicable data protection laws. These may include the right (i) to request access and obtain a copy of your personal information, (ii) to request rectification or erasure; (iii) to restrict the processing of your personal information; (iv) if applicable, to data portability; and (v) not to be subject to automated decision-making. If a decision that produces legal or similarly significant effects is made solely by automated means, we will inform you, explain the main factors, and offer a simple way to request human review. In certain circumstances, you may also have the right to object to the processing of your personal information.</p>
                    <p>We will consider and act upon any request in accordance with applicable data protection laws.</p>
                    <p>If you are located in the EEA or UK and you believe we are unlawfully processing your personal information, you also have the right to complain to your <a href="https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">Member State data protection authority</a> or <a href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">UK data protection authority</a>.</p>
                    <p>If you are located in Switzerland, you may contact the <a href="https://www.edoeb.admin.ch/edoeb/en/home.html" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">Federal Data Protection and Information Commissioner</a>.</p>
                    <p><strong className="text-[#DEDCDC]"><u>Withdrawing your consent:</u></strong> If we are relying on your consent to process your personal information, which may be express and/or implied consent depending on the applicable law, you have the right to withdraw your consent at any time. You can withdraw your consent at any time by contacting us using the contact details provided in Section 14 below.</p>
                    <p>However, please note that this will not affect the lawfulness of the processing before its withdrawal nor, when applicable law allows, will it affect the processing of your personal information conducted in reliance on lawful processing grounds other than consent.</p>

                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Account Information</h3>
                    <p>If you would at any time like to review or change the information in your account or terminate your account, you can log in to your account settings and update your user account.</p>
                    <p>Upon your request to terminate your account, we will deactivate or delete your account and information from our active databases. However, we may retain some information in our files to prevent fraud, troubleshoot problems, assist with any investigations, enforce our legal terms and/or comply with applicable legal requirements.</p>
                    <p><strong className="text-[#DEDCDC]"><u>Cookies and similar technologies:</u></strong> Most Web browsers are set to accept cookies by default. If you prefer, you can usually choose to set your browser to remove cookies and to reject cookies. If you choose to remove cookies or reject cookies, this could affect certain features or services of our Services.</p>
                    <p>If you have questions or comments about your privacy rights, you may email us at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>.</p>

                    {/* ─── 10. DNT ─── */}
                    <h2 id="dnt" className="text-xl font-bold text-[#C5BAC4] pt-6">10. Controls for Do-Not-Track Features</h2>
                    <p>Most web browsers and some mobile operating systems and mobile applications include a Do-Not-Track (&lsquo;DNT&rsquo;) feature or setting you can activate to signal your privacy preference not to have data about your online browsing activities monitored and collected. At this stage, no uniform technology standard for recognising and implementing DNT signals has been finalised. As such, we do not currently respond to DNT browser signals or any other mechanism that automatically communicates your choice not to be tracked online. If a standard for online tracking is adopted that we must follow in the future, we will inform you about that practice in a revised version of this Privacy Notice.</p>
                    <p>California law requires us to let you know how we respond to web browser DNT signals. Because there currently is not an industry or legal standard for recognising or honouring DNT signals, we do not respond to them at this time.</p>

                    {/* ─── 11. US LAWS ─── */}
                    <h2 id="us-laws" className="text-xl font-bold text-[#C5BAC4] pt-6">11. Do United States Residents Have Specific Privacy Rights?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> If you are a resident of California, Colorado, Connecticut, Delaware, Florida, Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island, Tennessee, Texas, Utah, or Virginia, you may have the right to request access to and receive details about the personal information we maintain about you and how we have processed it, correct inaccuracies, get a copy of, or delete your personal information. You may also have the right to withdraw your consent to our processing of your personal information. These rights may be limited in some circumstances by applicable law.</em></p>
                    <p>We have not disclosed, sold, or shared any personal information to third parties for a business or commercial purpose in the preceding twelve (12) months. We will not sell or share personal information in the future belonging to website visitors, users, and other consumers.</p>

                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Your Rights</h3>
                    <p>You have rights under certain US state data protection laws. However, these rights are not absolute, and in certain cases, we may decline your request as permitted by law. These rights include:</p>
                    <ul className="list-disc pl-6 space-y-1">
                        <li><strong className="text-[#DEDCDC]">Right to know</strong> whether or not we are processing your personal data</li>
                        <li><strong className="text-[#DEDCDC]">Right to access</strong> your personal data</li>
                        <li><strong className="text-[#DEDCDC]">Right to correct</strong> inaccuracies in your personal data</li>
                        <li><strong className="text-[#DEDCDC]">Right to request</strong> the deletion of your personal data</li>
                        <li><strong className="text-[#DEDCDC]">Right to obtain a copy</strong> of the personal data you previously shared with us</li>
                        <li><strong className="text-[#DEDCDC]">Right to non-discrimination</strong> for exercising your rights</li>
                        <li><strong className="text-[#DEDCDC]">Right to opt out</strong> of the processing of your personal data if it is used for targeted advertising, the sale of personal data, or profiling</li>
                    </ul>

                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">How to Exercise Your Rights</h3>
                    <p>To exercise these rights, you can contact us by submitting a <a href="https://app.termly.io/dsar/16f5e918-d59f-4a62-af3f-bb496ee07a4e" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">data subject access request</a>, by emailing us at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>, or by referring to the contact details at the bottom of this document.</p>
                    <p>Under certain US state data protection laws, you can designate an authorised agent to make a request on your behalf. We may deny a request from an authorised agent that does not submit proof that they have been validly authorised to act on your behalf in accordance with applicable laws.</p>

                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Appeals</h3>
                    <p>Under certain US state data protection laws, if we decline to take action regarding your request, you may appeal our decision by emailing us at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>. We will inform you in writing of any action taken or not taken in response to the appeal, including a written explanation of the reasons for the decisions. If your appeal is denied, you may submit a complaint to your state attorney general.</p>

                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">California &lsquo;Shine The Light&rsquo; Law</h3>
                    <p>California Civil Code Section 1798.83, also known as the &lsquo;Shine The Light&rsquo; law, permits our users who are California residents to request and obtain from us, once a year and free of charge, information about categories of personal information (if any) we disclosed to third parties for direct marketing purposes and the names and addresses of all third parties with which we shared personal information in the immediately preceding calendar year. If you are a California resident and would like to make such a request, please submit your request in writing to us using the contact details provided in Section 14.</p>

                    {/* ─── 12. OTHER REGIONS ─── */}
                    <h2 id="other-laws" className="text-xl font-bold text-[#C5BAC4] pt-6">12. Do Other Regions Have Specific Privacy Rights?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> You may have additional rights based on the country you reside in.</em></p>
                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Australia and New Zealand</h3>
                    <p>We collect and process your personal information under the obligations and conditions set by Australia&apos;s Privacy Act 1988 and New Zealand&apos;s Privacy Act 2020 (Privacy Act).</p>
                    <p>If you do not wish to provide the personal information necessary to fulfil their applicable purpose, it may affect our ability to provide our services, in particular: offer you the products or services that you want, respond to or help with your requests, manage your account with us, and confirm your identity and protect your account.</p>
                    <p>At any time, you have the right to request access to or correction of your personal information.</p>
                    <p>If you believe we are unlawfully processing your personal information, you have the right to submit a complaint about a breach of the Australian Privacy Principles to the <a href="https://www.oaic.gov.au/privacy/privacy-complaints/lodge-a-privacy-complaint-with-us" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">Office of the Australian Information Commissioner</a> and a breach of New Zealand&apos;s Privacy Principles to the <a href="https://www.privacy.org.nz/your-rights/making-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">Office of New Zealand Privacy Commissioner</a>.</p>

                    <h3 className="text-base font-bold text-[#DEDCDC] pt-2">Republic of South Africa</h3>
                    <p>At any time, you have the right to request access to or correction of your personal information.</p>
                    <p>If you are unsatisfied with the manner in which we address any complaint with regard to our processing of personal information, you can contact the office of the regulator: <a href="https://inforegulator.org.za/" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">The Information Regulator (South Africa)</a>.</p>

                    {/* ─── 13. UPDATES ─── */}
                    <h2 id="policy-updates" className="text-xl font-bold text-[#C5BAC4] pt-6">13. Do We Make Updates to This Notice?</h2>
                    <p><em><strong className="text-[#DEDCDC]">In Short:</strong> Yes, we will update this notice as necessary to stay compliant with relevant laws.</em></p>
                    <p>We may update this Privacy Notice from time to time. The updated version will be indicated by an updated &lsquo;Last updated&rsquo; date at the top of this Privacy Notice. If we make material changes to this Privacy Notice, we may notify you either by prominently posting a notice of such changes or by directly sending you a notification. We encourage you to review this Privacy Notice frequently to be informed of how we are protecting your information.</p>

                    {/* ─── 14. CONTACT ─── */}
                    <h2 id="contact" className="text-xl font-bold text-[#C5BAC4] pt-6">14. How Can You Contact Us About This Notice?</h2>
                    <p>If you have questions or comments about this notice, you may email us at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>.</p>

                    {/* ─── 15. REVIEW/DELETE ─── */}
                    <h2 id="request" className="text-xl font-bold text-[#C5BAC4] pt-6">15. How Can You Review, Update, or Delete the Data We Collect From You?</h2>
                    <p>Based on the applicable laws of your country or state of residence, you may have the right to request access to the personal information we collect from you, details about how we have processed it, correct inaccuracies, or delete your personal information. You may also have the right to withdraw your consent to our processing of your personal information.</p>
                    <p>To request to review, update, or delete your personal information, please fill out and submit a <a href="https://app.termly.io/dsar/16f5e918-d59f-4a62-af3f-bb496ee07a4e" target="_blank" rel="noopener noreferrer" className="text-[#C5BAC4] hover:underline">data subject access request</a>.</p>

                </div>
            </div>
            <Footer />
        </div>
    );
}
