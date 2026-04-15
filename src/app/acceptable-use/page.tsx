import Link from "next/link";
import { Footer } from "@/components/layout/Footer";

export const metadata = {
    title: "Acceptable Use Policy | Blinkspot",
    description: "Understand the rules and guidelines for using the Blinkspot platform responsibly.",
};

export default function AcceptableUsePage() {
    return (
        <div className="min-h-screen bg-[#191D23] text-[#DEDCDC]">
            <div className="max-w-4xl mx-auto px-6 py-16 sm:py-24">

                {/* Back link */}
                <Link href="/" className="text-sm text-[#989DAA] hover:text-[#C5BAC4] transition-colors mb-8 inline-block">
                    &larr; Back to Home
                </Link>

                <h1 className="text-3xl sm:text-4xl font-bold text-[#C5BAC4] font-display mb-3">Acceptable Use Policy</h1>
                <p className="text-sm text-[#57707A] font-medium mb-12">Last updated April 14, 2026</p>

                <div className="prose-legal text-sm leading-relaxed text-[#989DAA] space-y-6">

                    <p>
                        This <strong>Acceptable Use Policy</strong> ('Policy') is part of our <strong>Terms of Service</strong> ('Legal Terms') and should therefore be read alongside our main Legal Terms: <Link href="/terms" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io/terms</Link>. When you use the AI-powered services provided by <strong>Mubia Investment Limited</strong> ('AI Products'), you warrant that you will comply with this document, our Legal Terms and all applicable laws and regulations governing AI. Your usage of our AI Products signifies your agreement to engage with our platform in a lawful, ethical, and responsible manner that respects the rights and dignity of all individuals. If you do not agree with these Legal Terms, please refrain from using our Services. Your continued use of our Services implies acceptance of these Legal Terms.
                    </p>
                    <p>Please carefully review this Policy which applies to any and all:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>(a) uses of our Services (as defined in 'Legal Terms')</li>
                        <li>(b) forms, materials, consent tools, comments, post, and all other content available on the Services ('Content')</li>
                        <li>(c) material which you contribute to the Services including any upload, post, review, disclosure, ratings, comments, chat etc. in any forum, chatrooms, reviews, and to any interactive services associated with it ('Contribution')</li>
                        <li>(d) responsible implementation and management of AI Products within our Services</li>
                    </ul>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">WHO WE ARE</h2>
                    <p>
                        We are <strong>Mubia Investment Limited</strong>, doing business as <strong>Blinkspot</strong> ('Company','we', 'us', or 'our') a company registered in Kenya at P.O. Box 621 - G.P.O, Nairobi 00100. We operate the website <Link href="/" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io</Link> (the 'Site'), as well as any other related products and services that refer or link to this Policy (collectively, the 'Services').
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">USE OF THE SERVICES</h2>
                    <p>When you use the Services, you warrant that you will comply with this Policy and with all applicable laws. You also acknowledge that you may not:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Systematically retrieve data or other content from the Services to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us.</li>
                        <li>Make any unauthorised use of the Services, including collecting usernames and/or email addresses of users by electronic or other means for the purpose of sending unsolicited email, or creating user accounts by automated means or under false pretences.</li>
                        <li>Circumvent, disable, or otherwise interfere with security-related features of the Services, including features that prevent or restrict the use or copying of any Content or enforce limitations on the use of the Services and/or the Content contained therein.</li>
                        <li>Engage in unauthorised framing of or linking to the Services.</li>
                        <li>Trick, defraud, or mislead us and other users, especially in any attempt to learn sensitive account information such as user passwords.</li>
                        <li>Make improper use of our Services, including our support services or submit false reports of abuse or misconduct.</li>
                        <li>Engage in any automated use of the Services, such as using scripts to send comments or messages, or using any data mining, robots, or similar data gathering and extraction tools.</li>
                        <li>Interfere with, disrupt, or create an undue burden on the Services or the networks or the Services connected.</li>
                        <li>Attempt to impersonate another user or person or use the username of another user.</li>
                        <li>Use any information obtained from the Services in order to harass, abuse, or harm another person.</li>
                        <li>Use the Services as part of any effort to compete with us or otherwise use the Services and/or the Content for any revenue-generating endeavour or commercial enterprise.</li>
                        <li>Decipher, decompile, disassemble, or reverse engineer any of the software comprising or in any way making up a part of the Services, except as expressly permitted by applicable law.</li>
                        <li>Attempt to bypass any measures of the Services designed to prevent or restrict access to the Services, or any portion of the Services.</li>
                        <li>Harass, annoy, intimidate, or threaten any of our employees or agents engaged in providing any portion of the Services to you.</li>
                        <li>Delete the copyright or other proprietary rights notice from any Content.</li>
                        <li>Copy or adapt the Services’ software, including but not limited to Flash, PHP, HTML, JavaScript, or other code.</li>
                        <li>Upload or transmit (or attempt to upload or to transmit) viruses, Trojan horses, or other material, including excessive use of capital letters and spamming (continuous posting of repetitive text), that interferes with any party’s uninterrupted use and enjoyment of the Services or modifies, impairs, disrupts, alters, or interferes with the use, features, functions, operation, or maintenance of the Services.</li>
                        <li>Upload or transmit (or attempt to upload or to transmit) any material that acts as a passive or active information collection or transmission mechanism, including without limitation, clear graphics interchange formats ('gifs'), 1×1 pixels, web bugs, cookies, or other similar devices.</li>
                        <li>Except as may be the result of standard search engine or Internet browser usage, use, launch, develop, or distribute any automated system, including without limitation, any spider, robot, cheat utility, scraper, or offline reader that accesses the Services, or using or launching any unauthorised script or other software.</li>
                        <li>Disparage, tarnish, or otherwise harm, in our opinion, us and/or the Services.</li>
                        <li>Use the Services in a manner inconsistent with any applicable laws or regulations.</li>
                        <li>Sell or otherwise transfer your profile.</li>
                        <li>Share account credentials with unauthorized users or exceed permitted usage limits.</li>
                        <li>Use the platform to generate or distribute spam, bulk unsolicited content, or engagement manipulation.</li>
                        <li>Use AI-generated content to impersonate individuals, brands, or organizations.</li>
                        <li>Attempt to bypass system safeguards, rate limits, or feature restrictions.</li>
                        <li>Use the Services in a way that violates any applicable social media platform rules or guidelines.</li>
                        <li>Automate abusive posting behavior that may harm platform integrity or third-party services.</li>
                        <li>Use a buying agent or purchasing agent to make purchases on the Services.</li>
                    </ul>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Subscriptions</h3>
                    <p>If you subscribe to our Services, you understand, acknowledge, and agree that you may not, except if expressly permitted:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Engage in any use, including modification, copying, redistribution, publication, display, performance, or retransmission, of any portions of any Services, other than as expressly permitted by this Policy, without the prior written consent of Mubia Investment Limited.</li>
                        <li>Reconstruct or attempt to discover any source code or algorithms of the Services, or any portion thereof, by any means whatsoever.</li>
                        <li>Provide, or otherwise make available, the Services to any third party.</li>
                        <li>Intercept any data not intended for you.</li>
                        <li>Damage, reveal, or alter any user's data, or any other hardware, software, or information relating to another person or entity.</li>
                        <li>Sharing account access with multiple users beyond the permitted plan limits.</li>
                        <li>Using the Services for commercial resale, sublicensing, or unauthorized distribution.</li>
                        <li>Circumventing usage limits, quotas, or subscription restrictions.</li>
                        <li>Creating multiple accounts to bypass pricing tiers or feature limitations.</li>
                        <li>Using automated scripts, bots, or scraping tools to extract data or content from the Services.</li>
                        <li>Exploiting the Services in a manner that places excessive load on infrastructure or degrades performance.</li>
                    </ul>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">AI Products</h3>
                    <p>When you use the AI Products provided by Mubia Investment Limited, you warrant that you will not:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Deploy AI techniques that utilise subliminal, manipulative, or deceptive methods designed to distort behaviour and impair informed decision-making, particularly when such actions cause significant harm to individuals.</li>
                        <li>Exploit vulnerabilities related to age, disability, or socio-economic circumstances through AI in a way that distorts behaviour or decision-making.</li>
                        <li>Use AI systems for biometric categorization that infer sensitive attributes such as race, political opinions, trade union membership, religious or philosophical beliefs, sex life, or sexual orientation, except in limited cases.</li>
                        <li>Implement AI-based social scoring systems that evaluate or classify individuals or groups based on their social behaviour or personal traits in a manner that causes harm, discrimination, or unfair treatment.</li>
                        <li>Assess the risk of an individual committing criminal offenses based solely on profiling, personality traits, or other non-behavioural factors.</li>
                        <li>Compile facial recognition databases through untargeted scraping of facial images from the internet, social media, or CCTV footage.</li>
                        <li>Use AI to infer emotions in sensitive environments such as workplaces, educational institutions, or any other context where such analysis could lead to discrimination, unfair treatment, or privacy violations.</li>
                        <li>Engage in real-time remote biometric identification in public places for law enforcement purposes, except in specific situations where there are strong legal justifications and oversight mechanisms.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">ARTIFICIAL INTELLIGENCE</h2>
                    <p>
                        We recognise the significant impact AI can have on our users and society, and we are dedicated to ensuring that our AI Products are designed and operated in a manner that aligns with comprehensive ethical standards. We aim to use AI to enhance user experiences while upholding fairness, transparency, and accountability principles.
                    </p>
                    <p>
                        This Policy applies to all AI-powered features, services, and systems in our Services. It governs the development, deployment, and use of AI technologies to protect users' rights and maintain transparency in all AI operations. This Policy applies to all stakeholders, including employees, third-party vendors, and partners who contribute to or interact with our AI Products.
                    </p>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Enforcement</h3>
                    <p>Any misuse of our AI Products or failure to adhere to the standards outlined in this Policy will result in appropriate actions to ensure the integrity of our platform and the protection of our users. Violations may include, but are not limited to:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Engaging the AI Products in ways that violate user privacy, manipulate data, disregard ethical guidelines, or are against AI Service Providers’ terms of use.</li>
                        <li>Deploying AI in a manner that introduces or causes bias, leading to unfair treatment of users or groups.</li>
                        <li>Improper handling, storage, or use of data by AI Products, leading to breaches of user trust and legal compliance.</li>
                        <li>Using AI in a way that compromises the privacy and security of our systems, data, or users.</li>
                    </ul>

                    <p>Depending on the violation, Mubia Investment Limited may take one or more of the following actions:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Warnings:</strong> The responsible party may receive a formal warning and be required to cease violating practices.</li>
                        <li><strong>Temporary Suspension:</strong> In cases of repeated or more severe violations, access to AI Products or certain features may be temporarily suspended.</li>
                        <li><strong>Termination of Access:</strong> Serious violations may lead to the permanent termination of access to our AI Products and Services.</li>
                        <li><strong>Legal Action:</strong> In cases where the misuse of AI leads to significant harm, data breaches, or legal violations, we may pursue legal action.</li>
                        <li><strong>Public Disclosure:</strong> For incidents that impact public trust or involve severe ethical breaches, we reserve the right to publicly disclose the violation.</li>
                    </ul>

                    <h3 className="text-lg font-bold text-[#DEDCDC] mt-8 mb-2">Commitment to Responsible AI</h3>
                    <p>
                        In addition to the consequences outlined above, we are deeply committed to repairing any harm caused by the misuse of AI. We will correct biased outcomes and implement additional safeguards to prevent future violations. At Mubia Investment Limited, we are committed to the ongoing refinement and enhancement of our Policy.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">CONTRIBUTIONS</h2>
                    <p>In this Policy, the term 'Contribution' means:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>any data, information, software, text, code, music, scripts, sound, graphics, photos, videos, tags, messages, interactive features, or other materials that you post, share, upload, submit, or otherwise provide in any manner on or through to the Services; or</li>
                        <li>any other content, materials, or data you provide to Mubia Investment Limited or use with the Services.</li>
                    </ul>
                    <p>You warrant that:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>you are the creator and owner of or have the necessary licences, rights, consents, releases, and permissions to use and to authorise us, the Services, and other users of the Services to use your Contributions;</li>
                        <li>all your Contributions comply with applicable laws and are original and true;</li>
                        <li>the creation, distribution, transmission, public display, or performance of your Contributions do not infringe the proprietary rights of any third party; and</li>
                        <li>you have the verifiable consent, release, and/or permission of each identifiable individual person in your Contributions.</li>
                    </ul>

                    <p>You also agree that you will not post, transmit, or upload any Contribution that:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>is in breach of applicable laws, regulation, court order, contractual obligation, this Policy, our Legal Terms, or a legal duty;</li>
                        <li>is defamatory, obscene, offensive, hateful, insulting, intimidating, bullying, abusive, or threatening;</li>
                        <li>is false, inaccurate, or misleading;</li>
                        <li>includes child sexual abuse material, or violates any applicable law concerning child pornography;</li>
                        <li>contains any material that solicits personal information from anyone under the age of 18;</li>
                        <li>promotes violence, advocates the violent overthrow of any government, or incites physical harm;</li>
                        <li>is discriminatory based on race, sex, religion, nationality, disability, sexual orientation, or age;</li>
                        <li>bullies, intimidates, humiliates, or insults any person;</li>
                        <li>promotes, facilitates, or assists anyone in promoting and facilitating acts of terrorism;</li>
                        <li>infringes, or assists anyone in infringing, a third party's intellectual property rights or publicity or privacy rights;</li>
                        <li>contains unsolicited or unauthorised advertising, promotional materials, pyramid schemes, chain letters, spam, mass mailings, or other forms of solicitation; or</li>
                        <li>misrepresents your identity or who the Contribution is from.</li>
                    </ul>

                    <p>You may not use our Services to offer, present, promote, sell, give away or otherwise make available to others any good or service involving:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>items that promote, encourage, facilitate, or instruct others how to engage in illegal activity</li>
                        <li>cigarettes, controlled substances and/or other products that present a risk to consumer safety, narcotics, steroids, drug paraphernalia</li>
                        <li>specific knives or other weapons regulated under applicable law</li>
                        <li>firearms, ammunition, or certain firearm parts or accessories</li>
                        <li>certain sexually oriented materials or services</li>
                        <li>certain items before the seller has control or possession of the item</li>
                        <li>stolen goods</li>
                        <li>products or services identified by government agencies to be highly likely to be fraudulent</li>
                        <li>any transaction or activity that requires pre-approval without having obtained said approval</li>
                    </ul>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">REPORTING A BREACH OF THIS POLICY</h2>
                    <p>
                        If you consider that any Service, Content, or Contribution breach this Policy, please email us at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>. Users can also send detailed feedback on their interactions with our AI Products by emailing us. You should include specific details about the AI interaction, such as the context, the nature of the concern, and any relevant screenshots or documentation.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">CONSEQUENCES OF BREACHING THIS POLICY</h2>
                    <p>
                        The consequences for violating our Policy will vary depending on the severity of the breach and the user's history on the Services. We may, in some cases, give you a warning and/or remove the infringing Contribution. However, if your breach is serious or if you continue to breach our Legal Terms and this Policy, we have the right to suspend or terminate your access to and use of our Services and, if applicable, disable your account. We may also notify law enforcement or issue legal proceedings against you when we believe that there is a genuine risk to an individual or a threat to public safety.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">DISCLAIMER</h2>
                    <p>
                        Mubia Investment Limited is under no obligation to monitor users’ activities, and we disclaim any responsibility for any user’s misuse of the Services. Mubia Investment Limited has no responsibility for any user or other Content or Contribution created, maintained, stored, transmitted, or accessible on or through the Services, and is not obligated to monitor or exercise any editorial control over such material. If Mubia Investment Limited becomes aware that any such Content or Contribution violates this Policy, Mubia Investment Limited may, in addition to removing such Content or Contribution and blocking your account, report such breach to the police or appropriate regulatory authority.
                    </p>
                </div>

                {/* Corporate Shield Contact Block */}
                <div className="mt-12 p-6 bg-[#2A2F38] border border-[#57707A]/30 rounded-xl">
                    <h2 className="text-lg font-semibold text-[#DEDCDC] mb-2">How Can You Contact Us About This Policy?</h2>
                    <p className="text-sm text-[#989DAA] mb-4">
                        If you have any further questions or comments or wish to report any problematic Content or Contribution, you may contact us by:
                    </p>
                    <p className="text-sm">
                        Registered Entity: <span className="text-[#DEDCDC]">Mubia Investment Limited</span>
                    </p>
                    <p className="text-sm mt-1">
                        Email: <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>
                    </p>
                    <p className="text-sm mt-1">
                        Mail: P.O. Box 621 - G.P.O, Nairobi 00100, Kenya
                    </p>
                </div>

            </div>
            <Footer />
        </div>
    );
}