"use client";

import Image from "next/image";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Fuel,
  Layers3,
  Repeat2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./credits.module.css";

const COLLECTION_URL = "https://opensea.io/collection/credits";
const COLLECTION_ADDRESS = "0x97630aa70ab14ed9883b41dafccbc11349723043";

type EthereumProvider = {
  request: (args: { method: string }) => Promise<string[]>;
};

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function CreditsStrategy() {
  const [markup, setMarkup] = useState(20);
  const [wallet, setWallet] = useState("");
  const [copied, setCopied] = useState(false);
  const [walletMessage, setWalletMessage] = useState("");
  const samplePurchase = 0.06;
  const targetPrice = useMemo(
    () => (samplePurchase * (1 + markup / 100)).toFixed(3),
    [markup],
  );

  async function connectWallet() {
    const provider = (window as typeof window & { ethereum?: EthereumProvider })
      .ethereum;

    if (!provider) {
      setWalletMessage("Install an EVM wallet to connect.");
      return;
    }

    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      setWallet(accounts[0] ?? "");
      setWalletMessage("");
    } catch {
      setWalletMessage("Wallet connection was cancelled.");
    }
  }

  async function copyCollection() {
    await navigator.clipboard.writeText(COLLECTION_ADDRESS);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.wordmark} href="#top" aria-label="Credits Strategy home">
          <span className={styles.mark}>CS</span>
          <span>CREDITS STRATEGY</span>
        </a>
        <div className={styles.navLinks}>
          <a href="#machine">Machine</a>
          <a href="#inventory">Inventory</a>
          <a href="#contract">Contract</a>
        </div>
        <button className={styles.walletButton} onClick={connectWallet} type="button">
          <Wallet aria-hidden="true" size={16} />
          {wallet ? shortenAddress(wallet) : "Connect wallet"}
        </button>
      </nav>

      <section className={styles.hero} id="top">
        <Image
          className={styles.heroImage}
          src="/credits/collection-banner.png"
          alt="A field of colorful pixel Credits artworks"
          fill
          priority
          sizes="100vw"
        />
        <div className={styles.heroShade} />
        <div className={styles.heroContent}>
          <div className={styles.kicker}>
            <span className={styles.liveDot} />
            Ethereum mainnet · TokenStrategy
          </div>
          <p className={styles.brandLine}>CREDITS STRATEGY</p>
          <h1>TURN FEES<br />INTO ART.</h1>
          <p className={styles.heroCopy}>
            Strategy trading fees accumulate, acquire Credits, and relist each
            work at a programmable premium.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryCta} href="#machine">
              View the machine <ArrowDown aria-hidden="true" size={17} />
            </a>
            <a
              className={styles.secondaryCta}
              href={COLLECTION_URL}
              target="_blank"
              rel="noreferrer"
            >
              View collection <ExternalLink aria-hidden="true" size={15} />
            </a>
          </div>
          {walletMessage ? (
            <p className={styles.walletMessage} role="status">{walletMessage}</p>
          ) : null}
        </div>
        <div className={styles.heroStamp} aria-hidden="true">
          <span>DEFAULT</span>
          <strong>+20%</strong>
          <span>RELIST</span>
        </div>
      </section>

      <div className={styles.ticker} aria-label="Strategy loop">
        <div className={styles.tickerTrack}>
          {[0, 1].map((group) => (
            <span key={group} aria-hidden={group === 1 ? "true" : undefined}>
          TRADING FEES <b>◆</b> POOL ETH <b>◆</b> BUY CREDITS <b>◆</b>
              RELIST +{markup}% <b>◆</b> REPEAT <b>◆</b>
            </span>
          ))}
        </div>
      </div>

      <section className={styles.machine} id="machine">
        <header className={styles.sectionHeading}>
          <p>01 / THE MACHINE</p>
          <h2>One loop. No idle fees.</h2>
          <span>
            TokenStrategy execution, onchain custody, factory-configurable targets.
          </span>
        </header>

        <div className={styles.machineGrid}>
          <div className={styles.signalPanel}>
            <div className={styles.panelTopline}>
              <span>STRATEGY SIGNAL</span>
              <span className={styles.status}><i /> PRE-DEPLOYMENT</span>
            </div>
            <div className={styles.signalReadout}>
              <div>
                <small>Treasury</small>
                <strong>0.000 ETH</strong>
              </div>
              <div>
                <small>Inventory</small>
                <strong>0 Credits</strong>
              </div>
            </div>
            <div className={styles.chart} aria-label="Illustrative strategy growth chart">
              <svg viewBox="0 0 800 280" role="img" aria-hidden="true">
                <defs>
                  <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#cbff35" stopOpacity=".25" />
                    <stop offset="1" stopColor="#cbff35" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path className={styles.gridLine} d="M0 55H800M0 125H800M0 195H800M160 0V280M320 0V280M480 0V280M640 0V280" />
                <path className={styles.areaLine} d="M0 235 C95 225,105 208,165 210 S255 173,320 177 S420 145,480 151 S570 85,640 100 S735 42,800 54 V280 H0 Z" />
                <path className={styles.valueLine} d="M0 235 C95 225,105 208,165 210 S255 173,320 177 S420 145,480 151 S570 85,640 100 S735 42,800 54" />
                <circle cx="800" cy="54" r="7" />
              </svg>
              <span className={styles.chartLabel}>ILLUSTRATIVE // NOT PERFORMANCE DATA</span>
            </div>
          </div>

          <aside className={styles.controlPanel}>
            <div className={styles.panelTopline}>
              <span>RELIST TARGET</span>
              <span>FACTORY CONFIGURABLE</span>
            </div>
            <div className={styles.markupReadout}>
              <span>+</span><strong>{markup}</strong><span>%</span>
            </div>
            <label className={styles.sliderLabel}>
              <span>Simulate markup</span>
              <input
                aria-label="Simulate relist markup"
                type="range"
                min="5"
                max="50"
                step="1"
                value={markup}
                onChange={(event) => setMarkup(Number(event.target.value))}
              />
            </label>
            <div className={styles.examplePrice}>
              <span>Example purchase <b>{samplePurchase.toFixed(3)} ETH</b></span>
              <ArrowRight aria-hidden="true" size={16} />
              <span>Target list <b>{targetPrice} ETH</b></span>
            </div>
            <p>
              TokenStrategy stores the multiplier in tenths of a percent. The
              default is 1,200 (1.2×); updates are controlled by its factory.
            </p>
          </aside>
        </div>
      </section>

      <section className={styles.loopSection}>
        <div className={styles.loopIntro}>
          <p>02 / OPERATING LOOP</p>
          <h2>Fees in.<br />Credits out.</h2>
        </div>
        <ol className={styles.loopList}>
          <li>
            <span>01</span>
            <Fuel aria-hidden="true" />
            <div><strong>Accumulate</strong><p>Uniswap v4 hook fees accrue inside the Credits Strategy.</p></div>
          </li>
          <li>
            <span>02</span>
            <Layers3 aria-hidden="true" />
            <div><strong>Target</strong><p>Anyone can submit a valid marketplace purchase call for one Credit.</p></div>
          </li>
          <li>
            <span>03</span>
            <ShieldCheck aria-hidden="true" />
            <div><strong>Acquire</strong><p>The contract verifies the token ID, custody, and actual ETH spent.</p></div>
          </li>
          <li>
            <span>04</span>
            <Repeat2 aria-hidden="true" />
            <div><strong>Sell + burn</strong><p>The asset sells at the target; proceeds buy and burn the strategy token.</p></div>
          </li>
        </ol>
      </section>

      <section className={styles.inventory} id="inventory">
        <header className={styles.inventoryHeader}>
          <div>
            <p>03 / INVENTORY</p>
            <h2>The collection becomes the treasury.</h2>
          </div>
          <a href={COLLECTION_URL} target="_blank" rel="noreferrer">
            Browse all 4,097 Credits <ExternalLink aria-hidden="true" size={15} />
          </a>
        </header>
        <div className={styles.artRail}>
          <div className={styles.artFeature}>
            <Image src="/credits/credit-1632.svg" alt="Credits artwork number 1632" fill sizes="(max-width: 700px) 75vw, 32vw" />
            <div><span>REFERENCE ASSET</span><strong>CREDIT #1632</strong></div>
          </div>
          <div className={styles.artFeature}>
            <Image src="/credits/credit-3255.svg" alt="Credits artwork number 3255" fill sizes="(max-width: 700px) 75vw, 32vw" />
            <div><span>REFERENCE ASSET</span><strong>CREDIT #3255</strong></div>
          </div>
          <div className={styles.emptySlot}>
            <span>VAULT SLOT 001</span>
            <strong>AWAITING<br />FIRST BUY</strong>
            <small>Inventory appears after deployment and acquisition.</small>
          </div>
        </div>
      </section>

      <section className={styles.contract} id="contract">
        <div className={styles.contractCopy}>
          <p>04 / CONTRACT SYSTEM</p>
          <h2>Built for the loop.<br />Explicit at every hop.</h2>
          <p>
            The official NFTStrategy contract handles token liquidity, fee
            accrual, Credits custody, fixed-price sales, and buy-and-burn. The
            TokenStrategy factory controls the relist multiplier.
          </p>
          <button className={styles.addressButton} type="button" onClick={copyCollection}>
            <span>COLLECTION</span>
            <code>{shortenAddress(COLLECTION_ADDRESS)}</code>
            {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
          </button>
        </div>
        <div className={styles.architecture} aria-label="Contract architecture">
          <div><small>UNISWAP V4</small><strong>Strategy Hook</strong><span>routes trading fees in ETH</span></div>
          <ArrowDown aria-hidden="true" />
          <div><small>TOKENWORKS</small><strong>NFTStrategy</strong><span>acquires · verifies · prices</span></div>
          <ArrowDown aria-hidden="true" />
          <div><small>ETHEREUM // 1</small><strong>Credits Collection</strong><span>holds · sells · buys &amp; burns</span></div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <Image
          src="/credits/credit-mark.svg"
          alt="Credits collection mark"
          width={180}
          height={180}
        />
        <div>
          <p>PERPETUAL ART ACQUISITION</p>
          <h2>MAKE EVERY TRADE<br />ADD TO THE STORY.</h2>
        </div>
        <a href="#top">Back to top <ArrowRight aria-hidden="true" size={18} /></a>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 CREDITS STRATEGY</span>
        <p>Experimental, unaudited software. No promise of profit. Marketplace and smart-contract execution carry independent risk.</p>
        <span>ETHEREUM MAINNET</span>
      </footer>
    </>
  );
}
