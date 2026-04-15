import Link from "next/link";
import { Footer } from "@/components/layout/Footer";

export const metadata = {
    title: "Terms of Service | Blinkspot",
    description: "Read our terms of service for using the Blinkspot platform.",
};

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[#191D23] text-[#DEDCDC]">
            <div className="max-w-4xl mx-auto px-6 py-16 sm:py-24">

                {/* Back link */}
                <Link href="/" className="text-sm text-[#989DAA] hover:text-[#C5BAC4] transition-colors mb-8 inline-block">
                    &larr; Back to Home
                </Link>

                <h1 className="text-3xl sm:text-4xl font-bold text-[#C5BAC4] font-display mb-3">Terms of Service</h1>
                <p className="text-sm text-[#57707A] font-medium mb-12">Last updated April 13, 2026</p>

                <div className="prose-legal text-sm leading-relaxed text-[#989DAA] space-y-6">

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">AGREEMENT TO OUR LEGAL TERMS</h2>
                    <p>
                        We are <strong>Mubia Investment Limited</strong>, doing business as <strong>Blinkspot</strong> (&apos;Company&apos;, &apos;we&apos;, &apos;us&apos;, or &apos;our&apos;), a company registered in Kenya at P.O. Box 621 - G.P.O, Nairobi 00100.
                    </p>
                    <p>
                        We operate the website <a href="https://www.blinkspot.io" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io</a> (the &apos;Site&apos;), as well as any other related products and services that refer or link to these legal terms (the &apos;Legal Terms&apos;) (collectively, the &apos;Services&apos;).
                    </p>
                    <p>
                        Blinkspot is a software platform that enables users to create, manage, and schedule social media content across multiple platforms. The service includes tools for content planning, automated posting, media creation using artificial intelligence, and a built-in editor for images and videos. Users can upload and organize digital assets, define brand preferences, and generate content aligned with their brand identity.
                    </p>
                    <p>
                        You can contact us by email at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a> or by mail to P.O. Box 621 - G.P.O, Nairobi 00100, Kenya.
                    </p>
                    <p>
                        These Legal Terms constitute a legally binding agreement made between you, whether personally or on behalf of an entity (&apos;you&apos;), and Mubia Investment Limited, concerning your access to and use of the Services. You agree that by accessing the Services, you have read, understood, and agreed to be bound by all of these Legal Terms. IF YOU DO NOT AGREE WITH ALL OF THESE LEGAL TERMS, THEN YOU ARE EXPRESSLY PROHIBITED FROM USING THE SERVICES AND YOU MUST DISCONTINUE USE IMMEDIATELY.
                    </p>
                    <p>
                        We will indicate updates by revising the &apos;Last updated&apos; date at the top of the Legal Terms. If we make material changes to these Legal Terms, we may notify you either by prominently posting a notice of such changes on our platform or by directly sending you an email notification.
                    </p>
                    <p>
                        The Services are intended for users who are at least 13 years of age. All users who are minors in the jurisdiction in which they reside (generally under the age of 18) must have the permission of, and be directly supervised by, their parent or guardian to use the Services. If you are a minor, you must have your parent or guardian read and agree to these Legal Terms prior to you using the Services.
                    </p>
                    <p>We recommend that you print a copy of these Legal Terms for your records.</p>

                    {/* TABLE OF CONTENTS */}
                    <div className="bg-[#2A2F38] border border-[#57707A]/30 p-6 rounded-xl my-10">
                        <h2 className="text-lg font-bold text-[#DEDCDC] mb-4">TABLE OF CONTENTS</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[#989DAA]">
                            <p>1. OUR SERVICES</p>
                            <p>2. INTELLECTUAL PROPERTY RIGHTS</p>
                            <p>3. USER REPRESENTATIONS</p>
                            <p>4. USER REGISTRATION</p>
                            <p>5. PURCHASES AND PAYMENT</p>
                            <p>6. SUBSCRIPTIONS</p>
                            <p>7. PROHIBITED ACTIVITIES</p>
                            <p>8. USER GENERATED CONTRIBUTIONS</p>
                            <p>9. CONTRIBUTION LICENCE</p>
                            <p>10. SOCIAL MEDIA</p>
                            <p>11. THIRD-PARTY WEBSITES AND CONTENT</p>
                            <p>12. SERVICES MANAGEMENT</p>
                            <p>13. PRIVACY POLICY</p>
                            <p>14. DMCA NOTICE AND POLICY</p>
                            <p>15. TERM AND TERMINATION</p>
                            <p>16. MODIFICATIONS AND INTERRUPTIONS</p>
                            <p>17. GOVERNING LAW</p>
                            <p>18. DISPUTE RESOLUTION</p>
                            <p>19. CORRECTIONS</p>
                            <p>20. DISCLAIMER</p>
                            <p>21. LIMITATIONS OF LIABILITY</p>
                            <p>22. INDEMNIFICATION</p>
                            <p>23. USER DATA</p>
                            <p>24. ELECTRONIC COMMUNICATIONS</p>
                            <p>25. CALIFORNIA USERS AND RESIDENTS</p>
                            <p>26. MISCELLANEOUS</p>
                            <p>27. AI-GENERATED CONTENT DISCLAIMER</p>
                            <p>28. USER CONTENT RESPONSIBILITY</p>
                            <p>29. THIRD-PARTY PLATFORM DISCLAIMER</p>
                            <p>30. AUTOMATED POSTING DISCLAIMER</p>
                            <p>31. CONTENT OWNERSHIP AND LICENSE</p>
                            <p>32. SERVICE AVAILABILITY</p>
                            <p>33. CONTACT US</p>
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">1. OUR SERVICES</h2>
                    <p>
                        The information provided when using the Services is not intended for distribution to or use by any person or entity in any jurisdiction or country where such distribution or use would be contrary to law or regulation or which would subject us to any registration requirement within such jurisdiction or country. Accordingly, those persons who choose to access the Services from other locations do so on their own initiative and are solely responsible for compliance with local laws, if and to the extent local laws are applicable.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">2. INTELLECTUAL PROPERTY RIGHTS</h2>
                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Our intellectual property</h3>
                    <p>
                        We are the owner or the licensee of all intellectual property rights in our Services, including all source code, databases, functionality, software, website designs, audio, video, text, photographs, and graphics in the Services (collectively, the &apos;Content&apos;), as well as the trademarks, service marks, and logos contained therein (the &apos;Marks&apos;).
                    </p>
                    <p>
                        Our Content and Marks are protected by copyright and trademark laws (and various other intellectual property rights and unfair competition laws) and treaties in the United States and around the world.
                    </p>
                    <p>
                        The Content and Marks are provided in or through the Services &apos;AS IS&apos; for your personal, non-commercial use or internal business purpose only.
                    </p>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Your use of our Services</h3>
                    <p>
                        Subject to your compliance with these Legal Terms, including the &apos;PROHIBITED ACTIVITIES&apos; section below, we grant you a non-exclusive, non-transferable, revocable licence to: access the Services; and download or print a copy of any portion of the Content to which you have properly gained access, solely for your personal, non-commercial use or internal business purpose.
                    </p>
                    <p>
                        Except as set out in this section or elsewhere in our Legal Terms, no part of the Services and no Content or Marks may be copied, reproduced, aggregated, republished, uploaded, posted, publicly displayed, encoded, translated, transmitted, distributed, sold, licensed, or otherwise exploited for any commercial purpose whatsoever, without our express prior written permission.
                    </p>
                    <p>
                        If you wish to make any use of the Services, Content, or Marks other than as set out in this section or elsewhere in our Legal Terms, please address your request to: info@blinkspot.io. If we ever grant you the permission to post, reproduce, or publicly display any part of our Services or Content, you must identify us as the owners or licensors of the Services, Content, or Marks and ensure that any copyright or proprietary notice appears or is visible on posting, reproducing, or displaying our Content.
                    </p>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Your submissions and contributions</h3>
                    <p>
                        Please review this section and the &apos;PROHIBITED ACTIVITIES&apos; section carefully prior to using our Services to understand the (a) rights you give us and (b) obligations you have when you post or upload any content through the Services.
                    </p>
                    <p>
                        <strong>Submissions:</strong> By directly sending us any question, comment, suggestion, idea, feedback, or other information about the Services (&apos;Submissions&apos;), you agree to assign to us all intellectual property rights in such Submission. You agree that we shall own this Submission and be entitled to its unrestricted use and dissemination for any lawful purpose, commercial or otherwise, without acknowledgment or compensation to you.
                    </p>
                    <p>
                        <strong>Contributions:</strong> The Services may invite you to chat, contribute to, or participate in blogs, message boards, online forums, and other functionality during which you may create, submit, post, display, transmit, publish, distribute, or broadcast content and materials to us or through the Services, including but not limited to text, writings, video, audio, photographs, music, graphics, comments, reviews, rating suggestions, personal information, or other material (&apos;Contributions&apos;). Any Submission that is publicly posted shall also be treated as a Contribution.
                    </p>
                    <p>
                        You understand that Contributions may be viewable by other users of the Services and possibly through third-party websites.
                    </p>
                    <p>
                        <strong>When you post Contributions, you grant us a licence (including use of your name, trademarks, and logos):</strong> By posting any Contributions, you grant us an unrestricted, unlimited, irrevocable, perpetual, non-exclusive, transferable, royalty-free, fully-paid, worldwide right, and licence to: use, copy, reproduce, distribute, sell, resell, publish, broadcast, retitle, store, publicly perform, publicly display, reformat, translate, excerpt (in whole or in part), and exploit your Contributions (including, without limitation, your image, name, and voice) for any purpose, commercial, advertising, or otherwise, to prepare derivative works of, or incorporate into other works, your Contributions, and to sublicence the licences granted in this section. Our use and distribution may occur in any media formats and through any media channels.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">3. USER REPRESENTATIONS</h2>
                    <p>
                        By using the Services, you represent and warrant that: (1) all registration information you submit will be true, accurate, current, and complete; (2) you will maintain the accuracy of such information and promptly update such registration information as necessary; (3) you have the legal capacity and you agree to comply with these Legal Terms; (4) you are not under the age of 13; (5) you are not a minor in the jurisdiction in which you reside, or if a minor, you have received parental permission to use the Services; (6) you will not access the Services through automated or non-human means, whether through a bot, script or otherwise; (7) you will not use the Services for any illegal or unauthorised purpose; and (8) your use of the Services will not violate any applicable law or regulation.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">4. USER REGISTRATION</h2>
                    <p>
                        You may be required to register to use the Services. You agree to keep your password confidential and will be responsible for all use of your account and password. We reserve the right to remove, reclaim, or change a username you select if we determine, in our sole discretion, that such username is inappropriate, obscene, or otherwise objectionable.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">5. PURCHASES AND PAYMENT</h2>
                    <p>We accept the following forms of payment: Visa, Mastercard.</p>
                    <p>
                        You agree to provide current, complete, and accurate purchase and account information for all purchases made via the Services. You further agree to promptly update account and payment information, including email address, payment method, and payment card expiration date, so that we can complete your transactions and contact you as needed. Sales tax will be added to the price of purchases as deemed required by us. We may change prices at any time. All payments shall be in US dollars.
                    </p>
                    <p>
                        You agree to pay all charges at the prices then in effect for your purchases and any applicable shipping fees, and you authorise us to charge your chosen payment provider for any such amounts upon placing your order. We reserve the right to correct any errors or mistakes in pricing, even if we have already requested or received payment.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">6. SUBSCRIPTIONS</h2>
                    <p>
                        <strong>Billing and Renewal:</strong> Your subscription will continue and automatically renew unless cancelled. You consent to our charging your payment method on a recurring basis without requiring your prior approval for each recurring charge, until such time as you cancel the applicable order. The length of your billing cycle is monthly.
                    </p>
                    <p>
                        <strong>Cancellation:</strong> All purchases are non-refundable. You can cancel your subscription at any time by contacting us using the contact information provided below. Your cancellation will take effect at the end of the current paid term. If you have any questions or are unsatisfied with our Services, please email us at info@blinkspot.io.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">7. PROHIBITED ACTIVITIES</h2>
                    <p>As a user of the Services, you agree not to:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Systematically retrieve data or other content from the Services to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us.</li>
                        <li>Trick, defraud, or mislead us and other users, especially in any attempt to learn sensitive account information such as user passwords.</li>
                        <li>Circumvent, disable, or otherwise interfere with security-related features of the Services.</li>
                        <li>Disparage, tarnish, or otherwise harm, in our opinion, us and/or the Services.</li>
                        <li>Use any information obtained from the Services in order to harass, abuse, or harm another person.</li>
                        <li>Upload or transmit viruses, Trojan horses, or other material, including excessive use of capital letters and spamming.</li>
                        <li>Engage in any automated use of the system, such as using scripts to send comments or messages, or using any data mining, robots, or similar data gathering and extraction tools.</li>
                        <li>Attempt to impersonate another user or person or use the username of another user.</li>
                        <li><strong>Spam & Automation Abuse:</strong> Using the Services to engage in spam, mass unsolicited posting, or abusive automation practices across social media platforms.</li>
                        <li><strong>Illegal / Harmful Content:</strong> Using the Services to create, upload, or distribute content that is unlawful, harmful, abusive, harassing, hateful, or otherwise objectionable.</li>
                        <li><strong>Intellectual Property Abuse:</strong> Uploading, generating, or distributing content that infringes on the intellectual property rights of others, including copyrights, trademarks, or proprietary content without proper authorization.</li>
                        <li><strong>Platform Circumvention:</strong> Attempting to bypass, disable, or interfere with security features, usage limits, or restrictions of the Services.</li>
                        <li><strong>Account Abuse / Reselling:</strong> Sharing, selling, or transferring access to accounts without authorization, or using the Services for unauthorized commercial resale purposes.</li>
                        <li><strong>AI Content Misuse:</strong> Using the Services to generate, upload, or distribute content that is misleading, deceptive, harmful, defamatory, or intended to impersonate any individual, brand, or entity without authorization.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">8. USER GENERATED CONTRIBUTIONS</h2>
                    <p>When you create or make available any Contributions, you thereby represent and warrant that:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>The creation, distribution, transmission, public display, or performance, and the accessing, downloading, or copying of your Contributions do not and will not infringe the proprietary rights of any third party.</li>
                        <li>You are the creator and owner of or have the necessary licences, rights, consents, releases, and permissions to use your Contributions.</li>
                        <li>Your Contributions are not false, inaccurate, or misleading.</li>
                        <li>Your Contributions are not unsolicited or unauthorised advertising, promotional materials, pyramid schemes, chain letters, spam, mass mailings, or other forms of solicitation.</li>
                        <li>Your Contributions are not obscene, lewd, lascivious, filthy, violent, harassing, libellous, slanderous, or otherwise objectionable.</li>
                        <li>Your Contributions do not ridicule, mock, disparage, intimidate, or abuse anyone.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">9. CONTRIBUTION LICENCE</h2>
                    <p>
                        By posting your Contributions to any part of the Services or making Contributions accessible to the Services by linking your account from the Services to any of your social networking accounts, you automatically grant, and you represent and warrant that you have the right to grant, to us an unrestricted, unlimited, irrevocable, perpetual, non-exclusive, transferable, royalty-free, fully-paid, worldwide right, and licence to host, use, copy, reproduce, disclose, sell, resell, publish, broadcast, retitle, archive, store, cache, publicly perform, publicly display, reformat, translate, transmit, excerpt, and distribute such Contributions.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">10. SOCIAL MEDIA</h2>
                    <p>
                        As part of the functionality of the Services, you may link your account with online accounts you have with third-party service providers. You represent and warrant that you are entitled to disclose your Third-Party Account login information to us and/or grant us access to your Third-Party Account, without breach by you of any of the terms and conditions that govern your use of the applicable Third-Party Account.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">11. THIRD-PARTY WEBSITES AND CONTENT</h2>
                    <p>
                        The Services may contain links to other websites (&apos;Third-Party Websites&apos;) as well as articles, photographs, text, graphics, pictures, designs, music, sound, video, information, applications, software, and other content or items belonging to or originating from third parties. Such Third-Party Websites and Third-Party Content are not investigated, monitored, or checked for accuracy, appropriateness, or completeness by us, and we are not responsible for any Third-Party Websites accessed through the Services.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">12. SERVICES MANAGEMENT</h2>
                    <p>
                        We reserve the right, but not the obligation, to: (1) monitor the Services for violations of these Legal Terms; (2) take appropriate legal action against anyone who, in our sole discretion, violates the law or these Legal Terms; (3) in our sole discretion and without limitation, refuse, restrict access to, limit the availability of, or disable any of your Contributions; and (4) otherwise manage the Services in a manner designed to protect our rights and property and to facilitate the proper functioning of the Services.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">13. PRIVACY POLICY</h2>
                    <p>
                        We care about data privacy and security. Please review our Privacy Policy: <Link href="/privacy" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io/privacy</Link>. By using the Services, you agree to be bound by our Privacy Policy, which is incorporated into these Legal Terms.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">14. DIGITAL MILLENNIUM COPYRIGHT ACT (DMCA) NOTICE</h2>
                    <p>
                        We respect the intellectual property rights of others. If you believe that any material available on or through the Services infringes upon any copyright you own or control, please immediately notify our Designated Copyright Agent at <strong>info@blinkspot.io</strong>.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">15. TERM AND TERMINATION</h2>
                    <p>
                        These Legal Terms shall remain in full force and effect while you use the Services. WE RESERVE THE RIGHT TO, IN OUR SOLE DISCRETION AND WITHOUT NOTICE OR LIABILITY, DENY ACCESS TO AND USE OF THE SERVICES (INCLUDING BLOCKING CERTAIN IP ADDRESSES), TO ANY PERSON FOR ANY REASON OR FOR NO REASON.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">16. MODIFICATIONS AND INTERRUPTIONS</h2>
                    <p>
                        We reserve the right to change, modify, or remove the contents of the Services at any time or for any reason at our sole discretion without notice. We will not be liable to you or any third party for any modification, price change, suspension, or discontinuance of the Services.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">17. GOVERNING LAW</h2>
                    <p>
                        These Legal Terms shall be governed by and defined following the laws of Kenya. Mubia Investment Limited and yourself irrevocably consent that the courts of Kenya shall have exclusive jurisdiction to resolve any dispute which may arise in connection with these Legal Terms.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">18. DISPUTE RESOLUTION</h2>
                    <p>
                        Any dispute arising out of or in connection with these Legal Terms, including any question regarding its existence, validity, or termination, shall be referred to and finally resolved by arbitration. The seat, or legal place, of arbitration shall be Kenya. The language of the proceedings shall be English.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">19. CORRECTIONS</h2>
                    <p>
                        There may be information on the Services that contains typographical errors, inaccuracies, or omissions, including descriptions, pricing, availability, and various other information. We reserve the right to correct any errors, inaccuracies, or omissions.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">20. DISCLAIMER</h2>
                    <p>
                        THE SERVICES ARE PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS. YOU AGREE THAT YOUR USE OF THE SERVICES WILL BE AT YOUR SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, IN CONNECTION WITH THE SERVICES AND YOUR USE THEREOF.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">21. LIMITATIONS OF LIABILITY</h2>
                    <p>
                        IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT, INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFIT, LOST REVENUE, LOSS OF DATA, OR OTHER DAMAGES ARISING FROM YOUR USE OF THE SERVICES. OUR LIABILITY TO YOU FOR ANY CAUSE WHATSOEVER WILL AT ALL TIMES BE LIMITED TO THE LESSER OF THE AMOUNT PAID BY YOU TO US DURING THE SIX (6) MONTH PERIOD PRIOR TO ANY CAUSE OF ACTION ARISING OR $100.00 USD.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">22. INDEMNIFICATION</h2>
                    <p>
                        You agree to defend, indemnify, and hold us harmless, including our subsidiaries, affiliates, and all of our respective officers, agents, partners, and employees, from and against any loss, damage, liability, claim, or demand, including reasonable attorneys&apos; fees and expenses, made by any third party due to or arising out of your Contributions, use of the Services, or breach of these Legal Terms.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">27. AI-GENERATED CONTENT DISCLAIMER</h2>
                    <p>
                        Blinkspot provides AI-powered tools that generate text, images, videos, and other content based on user inputs. You acknowledge that AI-generated content may be inaccurate, incomplete, misleading, or inappropriate for your intended use. Blinkspot does not guarantee the accuracy, reliability, or quality of any generated content. You are solely responsible for reviewing, editing, and approving all content before use or publication.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">28. USER CONTENT RESPONSIBILITY</h2>
                    <p>
                        You are solely responsible for all content you create, upload, generate, schedule, or publish using Blinkspot. You agree not to use the Services to create or distribute unlawful, harmful, misleading, defamatory, or infringing content. Blinkspot does not monitor or control user content and shall not be held liable for any content posted or shared on the platform.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">29. THIRD-PARTY PLATFORM DISCLAIMER</h2>
                    <p>
                        Blinkspot integrates with third-party platforms, including but not limited to social media networks. Blinkspot does not control and is not responsible for the policies, actions, or decisions of such third-party platforms. You acknowledge that your use of these platforms is subject to their respective terms and policies. Blinkspot shall not be liable for account suspensions, content removal, reduced reach, or any other actions taken by third-party platforms.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">30. AUTOMATED POSTING AND SCHEDULING DISCLAIMER</h2>
                    <p>
                        Blinkspot provides automated scheduling and posting features for user convenience. While we strive to ensure reliability, Blinkspot does not guarantee that scheduled content will be published at the exact specified time or at all. You are responsible for reviewing all scheduled content prior to publication. Blinkspot shall not be liable for missed posts, delayed publishing, duplicate posts, or any resulting damages.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">31. CONTENT OWNERSHIP AND LICENSE</h2>
                    <p>
                        You retain ownership of any content you upload or create using Blinkspot. By using the Services, you grant Blinkspot a non-exclusive, worldwide, royalty-free license to use, store, process, and display your content solely for the purpose of operating, improving, and providing the Services. Blinkspot does not claim ownership over your content but may use aggregated and anonymized data to enhance platform performance.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">32. SERVICE AVAILABILITY AND NO GUARANTEE</h2>
                    <p>
                        Blinkspot is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We do not guarantee that the Services will be uninterrupted, error-free, or secure at all times. You acknowledge that technical issues, maintenance, or third-party dependencies may result in temporary interruptions. Blinkspot shall not be liable for any loss of data, revenue, or business resulting from service disruptions or downtime.
                    </p>

                </div>

                {/* Corporate Shield Contact Block */}
                <div className="mt-12 p-6 bg-[#2A2F38] border border-[#57707A]/30 rounded-xl">
                    <p className="text-[#DEDCDC] font-medium mb-2">33. CONTACT US</p>
                    <p className="text-sm text-[#989DAA] mb-4">
                        In order to resolve a complaint regarding the Services or to receive further information regarding use of the Services, please contact us at:
                    </p>
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