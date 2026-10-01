import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserProvider, Contract, JsonRpcProvider, ZeroHash, decodeBytes32String, encodeBytes32String, formatUnits, getAddress, isAddress, parseUnits } from 'ethers'
import EthereumProvider from '@walletconnect/ethereum-provider'
import { FiCopy, FiKey, FiShield, FiX } from 'react-icons/fi'
import { FaFirefox, FaRainbow } from 'react-icons/fa'
import { SiBinance, SiCoinbase, SiWalletconnect } from 'react-icons/si'
import { LOCK01_ADDRESS, PUBLIC_RPC, erc20Abi, lock01Abi } from './contracts'
import './styles.css'
import './wallet-modal.css'
import './deadline.css'
import './icon.css'
import './binance.css'
import './foxwallet.css'
import './query-validation.css'
import './hero-balance.css'

const emptyPosition = { locked: '—', lockerBalance: '—', lockQuantity: '—', claimable: '—', data: '—', walletBalance: '连接钱包后显示' }
const shortAddress = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'
const formatPositionToken = (value, decimals, symbol) => `${Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
const formatDeadline = (value) => {
  const timestamp = Number(value)
  if (!timestamp) return { text: '未设置', expired: false }
  return {
    text: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium', hour12: false }).format(new Date(timestamp * 1000)),
    expired: Date.now() >= timestamp * 1000
  }
}

function App() {
  const [wallet, setWallet] = useState(null)
  const [token, setToken] = useState(null)
  const [amount, setAmount] = useState('')
  const [data, setData] = useState('')
  const [queryAddress, setQueryAddress] = useState('')
  const [position, setPosition] = useState(emptyPosition)
  const [claimableRaw, setClaimableRaw] = useState(0n)
  const [queryPosition, setQueryPosition] = useState(emptyPosition)
  const [market, setMarket] = useState({ current: '—', totalLocked: '—', deadline: '—', deadlineExpired: false })
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
      const readProvider = new JsonRpcProvider(PUBLIC_RPC)
      const readContract = new Contract(LOCK01_ADDRESS, lock01Abi, readProvider)
      const [current, timeoutDeadline, tokenAddress] = await Promise.all([readContract.getCurrentPrice(), readContract.TIMEOUT_DEADLINE(), readContract.TOKEN01()])
      const readToken = new Contract(tokenAddress, erc20Abi, readProvider)
      const [totalLocked, tokenDecimals, tokenSymbol] = await Promise.all([readToken.balanceOf(LOCK01_ADDRESS), readToken.decimals(), readToken.symbol()])
      const deadline = formatDeadline(timeoutDeadline)
      setMarket({ current: formatUnits(current, 18), totalLocked: `${Number(formatUnits(totalLocked, tokenDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${tokenSymbol}`, deadline: deadline.text, deadlineExpired: deadline.expired })
    } catch { /* A public RPC failure should not block wallet interaction. */ }
  }, [])

  const refresh = useCallback(async (addressToQuery = wallet?.address, isAddressLookup = false) => {
    if (!addressToQuery) return
    if (!isAddress(addressToQuery)) return showNotice('请输入有效的 EVM 地址', 'error')
    try {
      const address = getAddress(addressToQuery)
      const useWalletProvider = wallet && token && address.toLowerCase() === wallet.address.toLowerCase()
      let positionContract = wallet?.contract
      let positionToken = token?.contract
      let decimals = token?.decimals
      let symbol = token?.symbol
      if (!useWalletProvider) {
        const provider = new JsonRpcProvider(PUBLIC_RPC)
        positionContract = new Contract(LOCK01_ADDRESS, lock01Abi, provider)
        positionToken = new Contract(await positionContract.TOKEN01(), erc20Abi, provider)
        ;[decimals, symbol] = await Promise.all([positionToken.decimals(), positionToken.symbol()])
        decimals = Number(decimals)
      }
      const [locker, balance, minBalance] = await Promise.all([positionContract.userLockers(address), positionToken.balanceOf(address), positionContract.getMinBalance(address)])
      const claimable = locker.balance > minBalance ? locker.balance - minBalance : 0n
      let lockerData = '—'
      if (locker.data !== ZeroHash) {
        try { lockerData = decodeBytes32String(locker.data) } catch { lockerData = locker.data }
      }
      const result = { locked: formatPositionToken(locker.totalLocked, decimals, symbol), lockerBalance: formatPositionToken(locker.balance, decimals, symbol), lockQuantity: formatPositionToken(minBalance, decimals, symbol), claimable: formatPositionToken(claimable, decimals, symbol), data: lockerData, walletBalance: formatPositionToken(balance, decimals, symbol) }
      if (isAddressLookup) {
        setQueryAddress(address)
        setQueryPosition(result)
      } else {
        setPosition(result)
        setClaimableRaw(claimable)
      }
    } catch { showNotice('无法读取钱包数据', 'error') }
  }, [showNotice, token, wallet])

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
      const nativeBalance = await provider.getBalance(address)
      const contract = new Contract(LOCK01_ADDRESS, lock01Abi, signer)
      const tokenAddress = await contract.TOKEN01()
      const tokenContract = new Contract(tokenAddress, erc20Abi, signer)
      let decimals = 18, symbol = 'TOKEN01'
      try { [decimals, symbol] = [Number(await tokenContract.decimals()), await tokenContract.symbol()] } catch { /* Token metadata is optional. */ }
      setWallet({ address, contract, source, eip1193Provider, nativeBalance: `${Number(formatUnits(nativeBalance, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH` })
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

  async function connectBinanceWallet() {
    const binanceProvider = window.BinanceChain || window.ethereum
    if (!binanceProvider) return showNotice('未检测到币安钱包；请安装扩展或使用 WalletConnect', 'error')
    return useProvider(binanceProvider, 'binance')
  }

  async function connectFoxWallet() {
    const foxProvider = window.foxwallet?.ethereum || window.ethereum
    if (!foxProvider) return showNotice('未检测到 FoxWallet；请安装扩展或使用 WalletConnect', 'error')
    return useProvider(foxProvider, 'foxwallet')
  }

  async function disconnect() {
    try { if (wallet?.source === 'walletconnect') await wallet.eip1193Provider.disconnect() } catch { /* Clear local state even if the remote session was already closed. */ }
    setWallet(null)
    setToken(null)
    setPosition(emptyPosition)
    setClaimableRaw(0n)
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
      return true
    } catch (error) {
      showNotice(error.shortMessage || error.reason || `${label}未完成`, 'error')
      return false
    }
    finally { setBusy('') }
  }

  function getAmount() {
    if (!amount.trim()) throw new Error('请输入数量')
    return parseUnits(amount, token.decimals)
  }

  async function approve() {
    try {
      const value = getAmount()
      const approved = await send('授权交易', () => token.contract.approve(LOCK01_ADDRESS, value))
      if (approved) setNeedsApproval(false)
    } catch (e) { showNotice(e.message || '请输入有效数量', 'error') }
  }
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
  const queryAddressIsValid = !queryAddress.trim() || isAddress(queryAddress.trim())

  return <main className="shell">
    <nav className="nav"><div className="brand"><div className="logo"><img src="/zero1-logo.png" alt="Zero1" /></div>LOCK01 <small>Ethereum Token Locker</small></div><div className="row">{wallet ? <><button className="button ghost compact" onClick={copyAddress}>已连接 · {shortAddress(wallet.address)} <FiCopy aria-hidden="true" /></button><button className="button ghost" onClick={disconnect}>断开连接</button></> : <button className="button" onClick={() => setWalletModalOpen(true)}>连接钱包</button>}</div></nav>
    <section className="hero"><div><div className="eyebrow">ON-CHAIN · SELF-CUSTODY</div><p>直接与已部署的 Lock01 智能合约交互。所有操作均由你的钱包签名并在以太坊主网上执行。</p><div className="hero-balance"><span>以太坊余额</span><strong>{wallet?.nativeBalance || '连接钱包后显示'}</strong></div></div></section>
    <section className="grid">
      <article className="card"><h2>我的仓位</h2><p className="sub">连接钱包后自动读取当前地址在合约中的锁仓信息。</p><div className="statgrid"><Stat title="总锁定" value={position.locked} /><Stat title="锁仓余额" value={position.lockerBalance} /><Stat title="可领取余额" value={position.claimable} /><Stat title="当前锁定数量" value={position.lockQuantity} /><Stat title="锁仓数据（bytes32）" value={position.data} full /></div><button className="button ghost wide" onClick={() => refresh()}>刷新数据</button><div className="claim"><label className="label">领取已满足条件的代币</label><button className="button wide" disabled={!connected || claimableRaw <= 0n || Boolean(busy)} onClick={() => send('领取交易', () => wallet.contract.claim())}>{isBusy('领取交易') ? '等待确认…' : '领取（Claim）'}</button></div><div className="unlock-note"><strong>解锁规则</strong><ul><li>按价格解锁：1 U 解锁 1%；1.1 U 的解锁量与 1 U 相同。</li><li>10 U 解锁 10%；100 U 时完全解锁。</li><li>锁仓满 2 年后，无论价格均可全部释放。</li><li>价格实时取自 ETH–01 交易对的 1% 手续费池。</li></ul></div></article>
      <article className="card"><h2>锁定代币</h2><p className="sub">系统会检查当前授权额度，仅在额度不足时请求新的授权。</p><label className="label">锁定数量</label><div className="row"><input className="field" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} /><button className="button ghost compact" onClick={setMax}>MAX</button></div><div className="mini">钱包余额：{position.walletBalance}</div><label className="label">附加数据（可选文本）</label><input className="field" maxLength="31" placeholder="最多 31 个 UTF-8 字节，将自动编码为 bytes32" value={data} onChange={(e) => setData(e.target.value)} /><div className="actions">{needsApproval ? <button className="button" disabled={!connected || Boolean(busy)} onClick={approve}>{isBusy('授权交易') ? '等待确认…' : '授权代币'}</button> : <button className="button" disabled={!connected || Boolean(busy)} onClick={lock}>{isBusy('锁定交易') ? '等待确认…' : '确认锁定'}</button>}</div><div className="notice">提示：附加数据会以 UTF-8 文本自动编码为 bytes32。锁定和领取会产生主网 Gas 费；本页面不托管资产，也不会请求助记词或私钥。</div></article>
      <article className="card"><h2>根据地址查询仓位</h2><p className="sub">无需连接钱包，输入地址即可查询该地址的锁仓信息。</p><label className="label">查询地址</label><div className="row"><input className="field" placeholder="0x..." value={queryAddress} aria-invalid={!queryAddressIsValid} onChange={(event) => setQueryAddress(event.target.value.trim())} /><button className="button ghost compact" disabled={!queryAddress.trim() || !queryAddressIsValid} onClick={() => refresh(queryAddress, true)}>查询</button></div>{!queryAddressIsValid && <p className="input-error">请输入有效的 0x 开头 EVM 地址。</p>}<div className="statgrid" style={{ marginTop: '16px' }}><Stat title="总锁定" value={queryPosition.locked} /><Stat title="锁仓余额" value={queryPosition.lockerBalance} /><Stat title="可领取余额" value={queryPosition.claimable} /><Stat title="当前锁定数量" value={queryPosition.lockQuantity} /><Stat title="锁仓数据（bytes32）" value={queryPosition.data} full /></div></article>
      <article className="card full"><h2>合约行情</h2><p className="sub">合约暴露的链上当前价格、锁仓总量与超时取回时间。</p><div className="statgrid"><Stat title="当前价格" value={market.current} /><Stat title="锁仓总量" value={market.totalLocked} /><Stat title="TIMEOUT_DEADLINE" value={market.deadline} note={market.deadlineExpired ? '已到期：全部锁仓的 01 可以取回。' : '未到期：达到该时间后，全部锁仓的 01 可以取回。'} /></div></article>
    </section><p className="footer"><a target="_blank" rel="noreferrer" href={`https://etherscan.io/address/${LOCK01_ADDRESS}#code`}>在 Etherscan 查看已验证合约 ↗</a></p>
    {notice && <div className={`status show ${notice.type}`}>{notice.text}</div>}
    {walletModalOpen && <div className="wallet-overlay" role="presentation" onMouseDown={() => setWalletModalOpen(false)}><section className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="wallet-list"><div className="wallet-modal-head"><h2 id="wallet-modal-title">连接钱包</h2><button className="modal-close" onClick={() => setWalletModalOpen(false)} aria-label="关闭"><FiX /></button></div><p className="wallet-kicker">常用钱包</p><button className="wallet-option" onClick={() => selectWallet(connect)}><FaRainbow className="wallet-icon rainbow" /><span>Rainbow</span></button><button className="wallet-option" onClick={() => selectWallet(connect)}><SiCoinbase className="wallet-icon base" /><span>Base</span></button><button className="wallet-option" onClick={() => selectWallet(connect)}><FaFirefox className="wallet-icon metamask" /><span>MetaMask</span></button><button className="wallet-option" onClick={() => selectWallet(connectFoxWallet)}><FaFirefox className="wallet-icon fox" /><span>FoxWallet</span></button><button className="wallet-option" onClick={() => selectWallet(connectBinanceWallet)}><SiBinance className="wallet-icon binance" /><span>币安钱包</span></button><button className="wallet-option" onClick={() => selectWallet(connectWalletConnect)}><SiWalletconnect className="wallet-icon walletconnect" /><span>WalletConnect</span></button></div><aside className="wallet-info"><h3>什么是钱包？</h3><InfoRow icon={<FiShield />} title="数字资产的安全入口" text="钱包用于发送、接收、存储和查看你的链上资产。" /><InfoRow icon={<FiKey />} title="更安全的登录方式" text="无需创建新账户或密码，只需连接你的钱包即可开始。" /><a className="wallet-learn" href="https://ethereum.org/wallets/" target="_blank" rel="noreferrer">了解钱包</a></aside></section></div>}
  </main>
}

function Stat({ title, value, full = false, note }) { return <div className={`stat ${full ? 'full' : ''}`}><span>{title}</span><b>{value}</b>{note && <small className="stat-note">{note}</small>}</div> }
function InfoRow({ icon, title, text }) { return <div className="wallet-info-row"><div className="wallet-info-icon">{icon}</div><div><strong>{title}</strong><p>{text}</p></div></div> }
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
