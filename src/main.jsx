import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserProvider, Contract, JsonRpcProvider, ZeroHash, decodeBytes32String, encodeBytes32String, formatUnits, parseUnits } from 'ethers'
import EthereumProvider from '@walletconnect/ethereum-provider'
import { FiCopy, FiKey, FiShield, FiX } from 'react-icons/fi'
import { FaFirefox, FaRainbow } from 'react-icons/fa'
import { SiCoinbase, SiWalletconnect } from 'react-icons/si'
import { LOCK01_ADDRESS, PUBLIC_RPC, erc20Abi, lock01Abi } from './contracts'
import './styles.css'
import './wallet-modal.css'

const emptyPosition = { locked: '—', claimable: '—', data: '—', balance: '连接钱包后显示' }
const shortAddress = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

function App() {
  const [wallet, setWallet] = useState(null)
  const [token, setToken] = useState(null)
  const [amount, setAmount] = useState('')
  const [data, setData] = useState('')
  const [position, setPosition] = useState(emptyPosition)
  const [market, setMarket] = useState({ current: '—', eth: '—', perEth: '—', token: '—' })
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState('')
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const [needsApproval, setNeedsApproval] = useState(false)

  const showNotice = useCallback((text, type = '') => {
    setNotice({ text, type })
    window.clearTimeout(window.lock01Notice)
    window.lock01Notice = window.setTimeout(() => setNotice(null), 4200)
  }, [])

  const formatToken = useCallback((value) => {
    if (!token) return '—'
    return `${Number(formatUnits(value, token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${token.symbol}`
  }, [token])

  const loadMarket = useCallback(async () => {
    try {
      const readContract = new Contract(LOCK01_ADDRESS, lock01Abi, new JsonRpcProvider(PUBLIC_RPC))
      const [current, eth, perEth, tokenAddress] = await Promise.all([readContract.getCurrentPrice(), readContract.getEthPrice(), readContract.getPerETH(), readContract.TOKEN01()])
      setMarket({ current: formatUnits(current, 18), eth: `$${formatUnits(eth, 18)}`, perEth: formatUnits(perEth, 18), token: shortAddress(tokenAddress) })
    } catch { /* A public RPC failure should not block wallet interaction. */ }
  }, [])

  const refresh = useCallback(async () => {
    if (!wallet || !token) return
    try {
      const [locker, balance] = await Promise.all([wallet.contract.userLockers(wallet.address), token.contract.balanceOf(wallet.address)])
      let lockerData = '—'
      if (locker.data !== ZeroHash) {
        try { lockerData = decodeBytes32String(locker.data) } catch { lockerData = locker.data }
      }
      setPosition({ locked: formatToken(locker.totalLocked), claimable: formatToken(locker.balance), data: lockerData, balance: formatToken(balance) })
    } catch { showNotice('无法读取钱包数据', 'error') }
  }, [formatToken, showNotice, token, wallet])

  useEffect(() => { loadMarket() }, [loadMarket])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!wallet || !token || !amount.trim()) {
      setNeedsApproval(false)
      return undefined
    }
    let active = true
    try {
      const value = parseUnits(amount, token.decimals)
      token.contract.allowance(wallet.address, LOCK01_ADDRESS)
        .then((allowance) => { if (active) setNeedsApproval(allowance < value) })
        .catch(() => { if (active) setNeedsApproval(true) })
    } catch { setNeedsApproval(true) }
    return () => { active = false }
  }, [amount, token, wallet])
  useEffect(() => {
    if (!window.ethereum) return undefined
    connect(true)
    const onAccountsChanged = () => window.location.reload()
    const onChainChanged = () => window.location.reload()
    window.ethereum.on('accountsChanged', onAccountsChanged)
    window.ethereum.on('chainChanged', onChainChanged)
    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccountsChanged)
      window.ethereum.removeListener?.('chainChanged', onChainChanged)
    }
  }, [])

  async function useProvider(eip1193Provider, source, silent = false) {
    try {
      const provider = new BrowserProvider(eip1193Provider)
      const accounts = await provider.send(silent ? 'eth_accounts' : 'eth_requestAccounts', [])
      if (!accounts.length) return
      if ((await provider.getNetwork()).chainId !== 1n) return showNotice('请将钱包切换到以太坊主网', 'error')
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      const contract = new Contract(LOCK01_ADDRESS, lock01Abi, signer)
      const tokenAddress = await contract.TOKEN01()
      const tokenContract = new Contract(tokenAddress, erc20Abi, signer)
      let decimals = 18, symbol = 'TOKEN01'
      try { [decimals, symbol] = [Number(await tokenContract.decimals()), await tokenContract.symbol()] } catch { /* Token metadata is optional. */ }
      setWallet({ address, contract, source, eip1193Provider })
      setToken({ contract: tokenContract, decimals, symbol })
      if (!silent) showNotice('钱包已连接', 'success')
    } catch (error) { if (!silent) showNotice(error.message?.includes('rejected') ? '连接已取消' : '钱包连接失败', 'error') }
  }

  async function connect(silent = false) {
    if (!window.ethereum) return showNotice('未检测到钱包，请安装 MetaMask 等 EVM 钱包', 'error')
    return useProvider(window.ethereum, 'injected', silent)
  }

  async function connectWalletConnect() {
    if (!walletConnectProjectId) return showNotice('请先在 .env 中配置 VITE_WALLETCONNECT_PROJECT_ID', 'error')
    try {
      const wcProvider = await EthereumProvider.init({
        projectId: walletConnectProjectId,
        chains: [1],
        optionalChains: [1],
        showQrModal: true,
        metadata: { name: 'LOCK01', description: 'Lock01 token locker', url: window.location.origin, icons: [] }
      })
      await wcProvider.connect()
      await useProvider(wcProvider, 'walletconnect')
    } catch (error) { showNotice(error.message?.includes('rejected') ? '连接已取消' : 'WalletConnect 连接失败', 'error') }
  }

  async function disconnect() {
    try { if (wallet?.source === 'walletconnect') await wallet.eip1193Provider.disconnect() } catch { /* Clear local state even if the remote session was already closed. */ }
    setWallet(null)
    setToken(null)
    setPosition(emptyPosition)
    setAmount('')
    setData('')
    showNotice('钱包已断开', 'success')
  }

  async function copyAddress() {
    if (!wallet) return
    try {
      await navigator.clipboard.writeText(wallet.address)
      showNotice('地址已复制', 'success')
    } catch { showNotice('复制失败，请手动复制地址', 'error') }
  }

  async function selectWallet(connectMethod) {
    setWalletModalOpen(false)
    await connectMethod()
  }

  async function send(label, action) {
    try {
      setBusy(label)
      const tx = await action()
      showNotice(`${label}，等待链上确认…`)
      await tx.wait()
      showNotice(`${label}成功`, 'success')
      await refresh()
    } catch (error) { showNotice(error.shortMessage || error.reason || `${label}未完成`, 'error') }
    finally { setBusy('') }
  }

  function getAmount() {
    if (!amount.trim()) throw new Error('请输入数量')
    return parseUnits(amount, token.decimals)
  }

  async function approve() { try { const value = getAmount(); await send('授权交易', () => token.contract.approve(LOCK01_ADDRESS, value)) } catch (e) { showNotice(e.message || '请输入有效数量', 'error') } }
  async function lock() {
    try {
      const value = getAmount(), payload = data.trim() ? encodeBytes32String(data.trim()) : ZeroHash
      if (await token.contract.allowance(wallet.address, LOCK01_ADDRESS) < value) throw new Error('请先授权不少于锁定数量的代币')
      await send('锁定交易', () => wallet.contract.lock(value, payload))
    } catch (e) { showNotice(e.shortMessage || e.message || '锁定未完成', 'error') }
  }
  async function setMax() { if (token && wallet) setAmount(formatUnits(await token.contract.balanceOf(wallet.address), token.decimals)) }
  const connected = Boolean(wallet && token)
  const isBusy = (label) => Boolean(busy) && busy === label

  return <main className="shell">
    <nav className="nav"><div className="brand"><div className="logo">⌁</div>LOCK01 <small>Ethereum Token Locker</small></div><div className="row">{wallet ? <><button className="button ghost compact" onClick={copyAddress}>已连接 · {shortAddress(wallet.address)} <FiCopy aria-hidden="true" /></button><button className="button ghost" onClick={disconnect}>断开连接</button></> : <button className="button" onClick={() => setWalletModalOpen(true)}>连接钱包</button>}</div></nav>
    <section className="hero"><div><div className="eyebrow">ON-CHAIN · SELF-CUSTODY</div><h1>锁定代币，<br />在价格条件满足时领取。</h1><p>直接与已部署的 Lock01 智能合约交互。所有操作均由你的钱包签名并在以太坊主网上执行。</p></div><div className="contract">合约地址<br /><a target="_blank" rel="noreferrer" href={`https://etherscan.io/address/${LOCK01_ADDRESS}#code`}>{shortAddress(LOCK01_ADDRESS)} ↗</a></div></section>
    <section className="grid">
      <article className="card"><h2>我的仓位</h2><p className="sub">连接钱包后自动读取当前地址在合约中的锁仓信息。</p><div className="statgrid"><Stat title="已锁定" value={position.locked} /><Stat title="可领取余额" value={position.claimable} /><Stat title="锁仓数据（bytes32）" value={position.data} full /></div><button className="button ghost wide" onClick={refresh}>刷新数据</button><div className="claim"><label className="label">领取已满足条件的代币</label><button className="button wide" disabled={!connected || Boolean(busy)} onClick={() => send('领取交易', () => wallet.contract.claim())}>{isBusy('领取交易') ? '等待确认…' : '领取（Claim）'}</button></div></article>
      <article className="card"><h2>锁定代币</h2><p className="sub">系统会检查当前授权额度，仅在额度不足时请求新的授权。</p><label className="label">锁定数量</label><div className="row"><input className="field" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} /><button className="button ghost compact" onClick={setMax}>MAX</button></div><div className="mini">钱包余额：{position.balance}</div><label className="label">附加数据（可选文本）</label><input className="field" maxLength="31" placeholder="最多 31 个 UTF-8 字节，将自动编码为 bytes32" value={data} onChange={(e) => setData(e.target.value)} /><div className="actions">{needsApproval ? <button className="button" disabled={!connected || Boolean(busy)} onClick={approve}>{isBusy('授权交易') ? '等待确认…' : '授权代币'}</button> : <button className="button" disabled={!connected || Boolean(busy)} onClick={lock}>{isBusy('锁定交易') ? '等待确认…' : '确认锁定'}</button>}</div><div className="notice">提示：附加数据会以 UTF-8 文本自动编码为 bytes32。锁定和领取会产生主网 Gas 费；本页面不托管资产，也不会请求助记词或私钥。</div></article>
      <article className="card full"><h2>合约行情</h2><p className="sub">合约暴露的链上读数，用于帮助核对价格与条件。</p><div className="statgrid"><Stat title="当前价格" value={market.current} /><Stat title="ETH / USD 价格" value={market.eth} /><Stat title="每 ETH 可得数量" value={market.perEth} /><Stat title="合约 TOKEN01" value={market.token} /></div></article>
    </section><p className="footer">使用 <a target="_blank" rel="noreferrer" href={`https://etherscan.io/address/${LOCK01_ADDRESS}#code`}>Etherscan 已验证合约</a> · 请仅在以太坊主网操作</p>
    {notice && <div className={`status show ${notice.type}`}>{notice.text}</div>}
    {walletModalOpen && <div className="wallet-overlay" role="presentation" onMouseDown={() => setWalletModalOpen(false)}><section className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="wallet-list"><div className="wallet-modal-head"><h2 id="wallet-modal-title">连接钱包</h2><button className="modal-close" onClick={() => setWalletModalOpen(false)} aria-label="关闭"><FiX /></button></div><p className="wallet-kicker">常用钱包</p><button className="wallet-option" onClick={() => selectWallet(connect)}><FaRainbow className="wallet-icon rainbow" /><span>Rainbow</span></button><button className="wallet-option" onClick={() => selectWallet(connect)}><SiCoinbase className="wallet-icon base" /><span>Base</span></button><button className="wallet-option" onClick={() => selectWallet(connect)}><FaFirefox className="wallet-icon metamask" /><span>MetaMask</span></button><button className="wallet-option" onClick={() => selectWallet(connectWalletConnect)}><SiWalletconnect className="wallet-icon walletconnect" /><span>WalletConnect</span></button></div><aside className="wallet-info"><h3>什么是钱包？</h3><InfoRow icon={<FiShield />} title="数字资产的安全入口" text="钱包用于发送、接收、存储和查看你的链上资产。" /><InfoRow icon={<FiKey />} title="更安全的登录方式" text="无需创建新账户或密码，只需连接你的钱包即可开始。" /><a className="wallet-learn" href="https://ethereum.org/wallets/" target="_blank" rel="noreferrer">了解钱包</a></aside></section></div>}
  </main>
}

function Stat({ title, value, full = false }) { return <div className={`stat ${full ? 'full' : ''}`}><span>{title}</span><b>{value}</b></div> }
function InfoRow({ icon, title, text }) { return <div className="wallet-info-row"><div className="wallet-info-icon">{icon}</div><div><strong>{title}</strong><p>{text}</p></div></div> }
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
