import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as ethers from 'ethers'
import * as strftime from 'strftime'

import { urlWithParams, tsToIso } from './helpers'
import { useRequest, useGambitPoolStats } from './dataProvider'

import {
  LineChart,
  BarChart,
  Line,
  Bar,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
  Area,
  AreaChart,
  ComposedChart
} from 'recharts';
import {
  RiLoader5Fill
} from 'react-icons/ri'

const { BigNumber } = ethers
const { formatUnits} = ethers.utils

const data = [
  {
    name: 'Page A',
    uv: 4000,
    pv: 2400,
    amt: 2400,
  },
  {
    name: 'Page B',
    uv: 3000,
    pv: 1398,
    amt: 2210,
  }
]

const numberFmt = Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const NOW = Math.floor(Date.now() / 1000)

const formatUsdValue = value => {
    if (value >= 1e9) {
      return `$${(value / 1e9).toFixed(value < 1e10 ? 2 : 1)}B`
    }
    if (value >= 1e6) {
      return `$${(value / 1e6).toFixed(value < 1e7 ? 2 : 1)}M`
    }
    if (value >= 1e3) {
      return `$${(value / 1e3).toFixed(value < 1e4 ? 2 : 1)}K`
    }
    return `$${value.toFixed(1)}`
}

const tooltipFormatter = (value, name, item) => {
  if (item && item.unit === '%') {
    return value.toFixed(2)
  }
  return numberFmt.format(value)
}

function Bsc() {
  const [from, setFrom] = useState(tsToIso(Date.now() - 86400000 * 30))
  const [to, setTo] = useState()

  const setDatetimeRange = useCallback(range => {
    setFrom(new Date(Date.now() - range * 1000).toISOString().slice(0, -5))    
    setTo(undefined)
  }, [setFrom, setTo])

  const fromTs = +new Date(from) / 1000
  const toTs = to ? +new Date(to) / 1000 : NOW

  const SECONDS_IN_HOUR = 3600
  const SECONDS_IN_DAY = 86400
  const period = (toTs - fromTs) <= 86400 * 3 ? SECONDS_IN_HOUR : SECONDS_IN_DAY
  const today = Math.floor(Date.now() / 1000 / SECONDS_IN_DAY) * SECONDS_IN_DAY
  const params = { period, from: fromTs, to: toTs }

  const [displayPercentage, setDisplayPercentage] = useState(false)
  const dynamicUnit = displayPercentage ? '%' : ''

  const [usersData, usersLoading] = useRequest(urlWithParams('/api/users', params), [])
  const usersChartData = useMemo(() => {
    return usersData.map(item => {
      const allValue = (item.margin || 0) + (item.swap || 0)
      const margin = displayPercentage ? (item.margin || 0) / allValue * 100 : item.margin
      const swap = displayPercentage ? (item.swap || 0) / allValue * 100 : item.swap
      return {
        margin,
        swap,
        all: displayPercentage ? 100 : allValue,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [usersData, displayPercentage])

  const [feesData, feesLoading] = useRequest(urlWithParams('/api/fees', params), [])
  const feesChartData = useMemo(() => {
    return feesData.map(item => {
      item.metrics = item.metrics || {}
      const allValue = Object.values(item.metrics).reduce((memo, el) => memo + el, 0)
      return {
        ...Object.entries(item.metrics).reduce((memo, [key, value]) => {
          memo[key] = displayPercentage ? value / allValue * 100 : value
          return memo
        }, {}),
        all: displayPercentage ? 100 : allValue,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [feesData, displayPercentage])
  const feesStats = useMemo(() => {
    if (!feesData || feesData.length === 0) {
      return
    }
    const getAll = metrics => Object.values(metrics).reduce((memo, value) => memo + value, 0)
    return {
      today: getAll(feesData[feesData.length - 1].metrics),
      last7days: feesData.slice(-7).reduce((memo, el) => {
        return memo + getAll(el.metrics)
      }, 0)
    }
  }, [feesData])

  const [swapSourcesData, swapSourcesLoading] = useRequest(urlWithParams('/api/swapSources', params), [])
  const swapSourcesChartData = useMemo(() => {
    return swapSourcesData.map(item => {
      item.metrics = item.metrics || {}
      const allValue = Object.values(item.metrics).reduce((memo, value) => memo + value, 0)

      const metrics = Object.entries(item.metrics).reduce((memo, [key, value]) => {
        memo[key] = displayPercentage ? value / allValue * 100 : value
        return memo
      }, {})

      return {
        ...metrics,
        all: displayPercentage ? 100 : allValue,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [swapSourcesData, displayPercentage])

  // const [poolStatsData, poolStatsLoading] = useRequest(urlWithParams('/api/poolStats2', params), [])
  const [poolStatsData, poolStatsLoading] = useGambitPoolStats({ from: fromTs, to: toTs, groupPeriod: period })
  const poolAmountsChartData = useMemo(() => {
    if (!poolStatsData) {
      return []
    }

    return poolStatsData.map(item => {
      const tokens = ['BTC', 'BNB', 'USDT', 'USDC', 'ETH', 'BUSD']
      const allValueUsd = tokens.reduce((memo, symbol) => {
          return memo + item[symbol]
      }, 0)

      if (displayPercentage) {
        return {
          ...tokens.reduce((memo, symbol) => {
            const valueUsd = item[symbol]
            memo[symbol] = valueUsd / allValueUsd * 100
            return memo
          }, {}),
          all: 100,
          date: new Date(item.timestamp * 1000)
        }
      }

      return {
        ...tokens.reduce((memo, symbol) => {
          const valueUsd = item[symbol]
          memo[symbol] = valueUsd
          return memo
        }, {}),
        all: allValueUsd,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [poolStatsData, displayPercentage])

  const usdgSupplyChartData = useMemo(() => {
    if (!poolStatsData) {
      return null
    }
    return poolStatsData.map(item => {
      const tokens = ['BTC', 'BNB', 'USDT', 'USDC', 'ETH', 'BUSD']
      const allValueUsd = tokens.reduce((memo, symbol) => {
          return memo + item[symbol]
      }, 0)
      const price = allValueUsd / item.usdgSupply
      return {
        value: item.usdgSupply,
        price,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [poolStatsData])

  const [volumeData, volumeLoading] = useRequest(urlWithParams('/api/volume', params), [])
  const volumeChartData = useMemo(() => {
    return volumeData.map(item => {
      if (!item.metrics) {
        return {
          timestamp: item.timestamp
        }
      }

      const allValue = Object.values(item.metrics).reduce((sum, value) => sum + value, 0)
      const metrics = Object.entries(item.metrics).reduce((memo, [key, value]) => {
        memo[key] = displayPercentage ? value / allValue * 100 : value
        return memo
      }, {})
      return {
        ...metrics,
        all: displayPercentage ? 100 : allValue,
        timestamp: item.timestamp
      }
    })
  }, [volumeData, displayPercentage])
  const volumeStats = useMemo(() => {
    if (!volumeData || volumeData.length === 0) {
      return
    }
    const getAll = el => Object.values(el.metrics || {}).reduce((sum, value) => sum + value, 0)
    return {
      today: getAll(volumeData[volumeData.length - 1]),
      last7days: volumeData.slice(-7).reduce((memo, el) => {
        return memo + getAll(el)
      }, 0)
    }
  }, [volumeData])

  const [volumeByHourData, volumeByHourLoading] = useRequest(urlWithParams('/api/volumeByHour', params), [])
  const volumeByHourChartData = useMemo(() => {
    const getAll = el => Object.values(el.metrics || {}).reduce((sum, value) => sum + value, 0)
    return volumeByHourData.map(item => {
      return {
        hour: item.hour,
        value: getAll(item)
      }
    })
  }, [volumeByHourData])

  const yaxisFormatter = useCallback((value, ...args) => {
    if (displayPercentage) {
      return value.toFixed(2)
    }
    return formatUsdValue(value)
  }, [displayPercentage])

  const tooltipLabelFormatter = useCallback((label, args) => {
    if (!label) {
      return
    }

    if (label.constructor !== Date) {
      label = new Date(label * 1000)
    }
    const item = args && args[0] && args[0].payload && args[0]
    const dateFmtString = period >= SECONDS_IN_DAY ? '%d.%m' : '%d.%m %H:%M'
    const date = strftime(dateFmtString, label)
    const all = item && item.payload.all
    if (all) {
      if (item && item.unit === '%') {
        return date
      }
      return `${date}, ${numberFmt.format(all)}`
    }
    return date
  }, [period])

  const tooltipLabelFormatterUnits = useCallback((label, args) => {
    if (!label) {
      return label
    }
    if (label.constructor !== Date) {
      label = new Date(label * 1000)
      if (!label.getDate()) {
        return label
      }
    }
    const date = strftime('%d.%m', label)

    const item = args && args[0]
    if (item && item.unit === '%') {
      return date
    }

    const all = item && item.payload.all

    if (label.constructor !== Date) {
      return `${label}, total: ${all}`
    }

    return `${date}, total: ${all}`
  })

  const CHART_HEIGHT = 300
  const YAXIS_WIDTH = 65

  return (
    <div className="Bsc">
      <h1>Gambit Analytics / BSC</h1>
      <div className="form">
        <p>
          <label>Period</label>
          <input type="datetime-local" value={from} onChange={evt => setFrom(evt.target.value)} />
          &nbsp;—&nbsp;
          <input type="datetime-local" value={to} onChange={evt => setTo(evt.target.value)} />
          <button onClick={evt => setDatetimeRange(86400 * 30)}>30 days</button>
          <button onClick={evt => setDatetimeRange(86400 * 7)}>7 days</button>
          <button onClick={evt => setDatetimeRange(86400)}>24 hours</button>
        </p>
        <p>
          <input id="displayPercentageCheckbox" type="checkbox" checked={displayPercentage} onChange={evt => setDisplayPercentage(evt.target.checked)} />
          <label htmlFor="displayPercentageCheckbox">Show relative shares</label>
        </p>
      </div>
      <div className="chart-grid">
        <div className="chart-cell">
          <h3>Volume</h3>
          {volumeStats &&
            <p className="stats">
              Today: <b>{numberFmt.format(volumeStats.today)}</b><br />
              Last 7 days: <b>{numberFmt.format(volumeStats.last7days)}</b>
            </p>
          }
          { volumeLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={volumeChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="swap" stackId="a" name="Swap" fill="#ee64b8" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="mint" stackId="a" name="Mint USDG" fill="#22c761" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="burn" stackId="a" name="Burn USDG" fill="#ab6100" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="liquidation" stackId="a" name="Liquidation" fill="#c90000" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="margin" stackId="a" name="Margin trading" fill="#8884ff" />

              <ReferenceLine x={1624406400} strokeWidth={2} stroke="lightblue">
                <Label value="1.5% threshold" angle={90} position="insideMiddle" />
              </ReferenceLine>
              <ReferenceLine x={1624924800} strokeWidth={2} stroke="lightblue">
                <Label value="1inch integration" angle={90} position="insideMiddle" />
              </ReferenceLine>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>Collected Fees</h3>
          {feesStats &&
            <p className="stats">
              Today: <b>{numberFmt.format(feesStats.today)}</b><br />
              Last 7 days: <b>{numberFmt.format(feesStats.last7days)}</b>
            </p>
          }
          { feesLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={feesChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="swap" stackId="a" name="Swap" fill="#ee64b8" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="mint" stackId="a" name="Mint USDG" fill="#22c761" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="burn" stackId="a" name="Burn USDG" fill="#ab6100" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="liquidation" stackId="a" name="Liquidation" fill="#c90000" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="margin" stackId="a" name="Margin trading" fill="#8884ff" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>
            Pool
          </h3>
          { poolStatsLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={poolAmountsChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="USDC" stackId="a" name="USDC" fill="#8884ff" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="USDT" stackId="a" name="USDT" fill="#ab6100" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="BUSD" stackId="a" name="BUSD" fill="#c90000" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="BTC" stackId="a" name="BTC" fill="#3483eb" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="ETH" stackId="a" name="ETH" fill="#eb8334" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="BNB" stackId="a" name="BNB" fill="#ee64b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>Swap Sources</h3>
          { swapSourcesLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={swapSourcesChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="1inch" stackId="a" name="1inch" fill="#ee64b8" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="dodoex" stackId="a" name="Dodoex" fill="#c90000" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="warden" stackId="a" name="WardenSwap" fill="#eb8334" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="metamask" stackId="a" name="MetaMask" fill="#ab6100" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="gmx" stackId="a" name="GMX" fill="#8884ff" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="other" stackId="a" name="Other" fill="#22c761" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-description">
            <ul>
              <li>Includes Swaps, USDG Mint and Burn.</li>
              <li>Source is identified by transaction recipient. E.g. if a swap transaction was sent to MetaMask Router and was routed MetaMask -> 1inch -> GMX than the swap source would be "MetaMask", not "1inch"</li>
            </ul>
          </div>
        </div>

        <div className="chart-cell">
          <h3>USDG</h3>
          { poolStatsLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart
              data={usdgSupplyChartData}
              syncId="syncId"
            >
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} />
              <YAxis dataKey="value" tickFormatter={tooltipFormatter} width={YAXIS_WIDTH} />
              <YAxis dataKey="price" tickFormatter={tooltipFormatter} orientation="right" yAxisId="right" width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <ooltip />
              <Legend />
              <Area type="monotone" dataKey="value" name="Supply" stroke="#9984d8" fillOpacity={0.5} fill="#8884d8" strokeWidth={2} />
              <Line type="monotone" dot={false} dataKey="price" yAxisId="right" name="Price" stroke="#ee64b8" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>Unique users</h3> 
          { usersLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={usersChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={displayPercentage ? '%' : ''} width={YAXIS_WIDTH} />
              <Tooltip
                labelFormatter={tooltipLabelFormatterUnits}
                formatter={value => displayPercentage ? value.toFixed(2) : value}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="margin" stackId="a" name="Margin trading" fill="#eb8334" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="swap" stackId="a" name="Swaps, Mint & Burn USDG" fill="#3483eb" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-description">
            <p>Includes users routed through other protocols (like 1inch)</p>
          </div>
        </div>

        <div className="chart-cell">
          <h3>Volume by hour</h3> 
          { volumeByHourLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={volumeByHourChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="hour" />
              <YAxis dataKey="value" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip />
              <Legend />
              <Bar type="monotone" dataKey="value" name="Volume" fill="#eb8334" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Bsc;