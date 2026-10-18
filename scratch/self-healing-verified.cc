#include "ns3/applications-module.h"
#include "ns3/core-module.h"
#include "ns3/flow-monitor-module.h"
#include "ns3/internet-module.h"
#include "ns3/ipv4-static-routing-helper.h"
#include "ns3/network-module.h"
#include "ns3/point-to-point-module.h"

#include <algorithm>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <string>

using namespace ns3;

// ============================================================
// GLOBAL STATE
// ============================================================

Ptr<Queue<Packet>> r1R2Queue;
Ptr<Queue<Packet>> r2R4Queue;
Ptr<Ipv4StaticRouting> r1StaticRouting;
Ptr<Ipv4> r1Ipv4;
Ipv4Address serverAddress;
Ipv4Address r1R2NextHop;
Ipv4Address r1R3NextHop;
uint32_t r1R2Interface = 0;
uint32_t r1R3Interface = 0;

uint32_t r1R2QueuePackets = 0;
uint32_t r2R4QueuePackets = 0;

uint32_t maxR1R2Queue = 0;
uint32_t maxR2R4Queue = 0;

// Path packet counters
uint64_t r1R2Packets = 0;
uint64_t r2R4Packets = 0;
uint64_t r1R3Packets = 0;
uint64_t r3R4Packets = 0;
uint64_t r1R2TxBytes = 0;
uint64_t r1R3PacketsAfterSwitch = 0;
uint64_t r3R4PacketsAfterSwitch = 0;
double failureTime = -1.0;
double configuredRecoveryTime = -1.0;
double firstAlternateTrafficTime = -1.0;
double firstPrimaryTrafficAfterRecoveryTime = -1.0;
bool primaryPathAvailable = true;
bool adaptiveMode = true;
bool recoveryPhaseActive = false;
uint32_t routeSwitchEvents = 0;
uint32_t randomRun = 1;
uint64_t randomSeed = 1;
std::string scenarioName = "adaptive";

// Route state
bool routeBActive = false;
bool routeApplicationAttempted = false;
double routeSwitchTime = -1.0;

const uint32_t CONGESTION_THRESHOLD = 50;

// ============================================================
// QUEUE TRACE CALLBACKS
// ============================================================

void
R1R2QueueTrace(uint32_t oldValue, uint32_t newValue)
{
    r1R2QueuePackets = newValue;

    if (newValue > maxR1R2Queue)
    {
        maxR1R2Queue = newValue;
    }
}

void
R2R4QueueTrace(uint32_t oldValue, uint32_t newValue)
{
    r2R4QueuePackets = newValue;

    if (newValue > maxR2R4Queue)
    {
        maxR2R4Queue = newValue;
    }
}

// ============================================================
// LINK PACKET TRACE CALLBACKS
// ============================================================

void
R1R2TxTrace(Ptr<const Packet> packet)
{
    r1R2Packets++;
    r1R2TxBytes += packet->GetSize();
    if (recoveryPhaseActive && firstPrimaryTrafficAfterRecoveryTime < 0.0)
    {
        firstPrimaryTrafficAfterRecoveryTime = Simulator::Now().GetSeconds();
    }
}

void
R2R4TxTrace(Ptr<const Packet> packet)
{
    r2R4Packets++;
}

void
R1R3TxTrace(Ptr<const Packet> packet)
{
    r1R3Packets++;
    if (routeBActive)
    {
        r1R3PacketsAfterSwitch++;
        if (firstAlternateTrafficTime < 0.0)
        {
            firstAlternateTrafficTime = Simulator::Now().GetSeconds();
        }
    }
}

void
R3R4TxTrace(Ptr<const Packet> packet)
{
    r3R4Packets++;
    if (routeBActive)
    {
        r3R4PacketsAfterSwitch++;
    }
}

// ============================================================
// ROUTE SWITCH
// ============================================================

void
ReplaceR1ServerHostRoute(Ipv4Address nextHop, uint32_t interface)
{
    for (uint32_t index = 0; index < r1StaticRouting->GetNRoutes(); ++index)
    {
        const Ipv4RoutingTableEntry route = r1StaticRouting->GetRoute(index);
        if (route.IsHost() && route.GetDest() == serverAddress)
        {
            r1StaticRouting->RemoveRoute(index);
            break;
        }
    }
    r1StaticRouting->AddHostRouteTo(serverAddress, nextHop, interface);
    routeApplicationAttempted = true;
}

void
SwitchToRouteB()
{
    if (routeBActive)
    {
        return;
    }

    ReplaceR1ServerHostRoute(r1R3NextHop, r1R3Interface);
    routeBActive = true;
    routeSwitchEvents++;
    if (routeSwitchTime < 0.0)
    {
        routeSwitchTime = Simulator::Now().GetSeconds();
    }

    std::cout << "\n";
    std::cout << "================================================\n";
    std::cout << "           CONGESTION DETECTED\n";
    std::cout << "================================================\n";

    std::cout
        << "Time: "
        << routeSwitchTime
        << " sec\n";

    std::cout
        << "R1-R2 Queue: "
        << r1R2QueuePackets
        << " packets\n";

    std::cout << "\n";

    std::cout
        << "OLD ROUTE:\n"
        << "PC -> R1 -> R2 -> R4 -> Server\n";

    std::cout << "\n";

    std::cout
        << "ADAPTIVE CONTROLLER:\n"
        << "Primary path is congested.\n"
        << "Selecting alternate path...\n";

    std::cout << "\n";

    std::cout
        << "NEW ROUTE:\n"
        << "PC -> R1 -> R3 -> R4 -> Server\n";

    std::cout << "\n";

    std::cout
        << "NOTE: Route decision recorded.\n"
        << "Packet counters will verify whether\n"
        << "traffic actually uses R1-R3.\n";

    std::cout << "================================================\n";
}

void
FailPrimaryPath()
{
    failureTime = Simulator::Now().GetSeconds();
    primaryPathAvailable = false;
    r1Ipv4->SetDown(r1R2Interface);
    SwitchToRouteB();
}

void
RestorePrimaryPath()
{
    r1Ipv4->SetUp(r1R2Interface);
    primaryPathAvailable = true;
    ReplaceR1ServerHostRoute(r1R2NextHop, r1R2Interface);
    routeBActive = false;
    routeSwitchEvents++;
    configuredRecoveryTime = Simulator::Now().GetSeconds();
    recoveryPhaseActive = true;
}

// ============================================================
// NETWORK MONITOR
// ============================================================

void
MonitorNetwork()
{
    double now =
        Simulator::Now().GetSeconds();

    std::cout << "\n";
    std::cout << "-----------------------------------------------\n";

    std::cout
        << "NETWORK MONITOR @ "
        << std::fixed
        << std::setprecision(2)
        << now
        << " sec\n";

    std::cout << "-----------------------------------------------\n";

    std::cout
        << "R1-R2 Queue: "
        << r1R2QueuePackets
        << " packets\n";

    std::cout
        << "R2-R4 Queue: "
        << r2R4QueuePackets
        << " packets\n";

    std::cout << "\n";

    std::cout
        << "R1-R2 packets: "
        << r1R2Packets
        << "\n";

    std::cout
        << "R1-R3 packets: "
        << r1R3Packets
        << "\n";

    std::cout
        << "R2-R4 packets: "
        << r2R4Packets
        << "\n";

    std::cout
        << "R3-R4 packets: "
        << r3R4Packets
        << "\n";

    // Detect congestion
    if (adaptiveMode && !routeBActive &&
        r1R2QueuePackets >= CONGESTION_THRESHOLD)
    {
        SwitchToRouteB();
    }

    std::cout << "-----------------------------------------------\n";
}

// ============================================================
// MAIN
// ============================================================

int
main(int argc, char* argv[])
{
    double simulationTime = 20.0;
    double trafficRateMbps = 8.0;
    double primaryCapacityMbps = 2.0;
    double alternateCapacityMbps = 10.0;
    double failureAtSec = 8.0;
    double restoreAtSec = 14.0;
    std::string outputPath = "simulation/results/verified.json";

    CommandLine cmd(__FILE__);

    cmd.AddValue(
        "simulationTime",
        "Simulation duration",
        simulationTime);
    cmd.AddValue("trafficRateMbps", "UDP offered traffic rate in Mbps", trafficRateMbps);
    cmd.AddValue("primaryCapacityMbps", "Capacity of each primary link in Mbps", primaryCapacityMbps);
    cmd.AddValue("alternateCapacityMbps", "Capacity of each alternate link in Mbps", alternateCapacityMbps);
    cmd.AddValue("scenario", "Scenario: normal, congestion, failure, recovery, or adaptive", scenarioName);
    cmd.AddValue("failureAtSec", "Primary-path failure time for failure/recovery scenarios", failureAtSec);
    cmd.AddValue("restoreAtSec", "Primary-path restore time for recovery scenario", restoreAtSec);
    cmd.AddValue("randomRun", "NS-3 random run number", randomRun);
    cmd.AddValue("randomSeed", "NS-3 random seed", randomSeed);
    cmd.AddValue("outputPath", "Path to the experiment JSON output", outputPath);

    cmd.Parse(argc, argv);
    const bool knownScenario = scenarioName == "normal" || scenarioName == "congestion" ||
                               scenarioName == "failure" || scenarioName == "recovery" ||
                               scenarioName == "adaptive";
    const bool needsFailureTime = scenarioName == "failure" || scenarioName == "recovery";
    if (!knownScenario || simulationTime <= 2.0 || trafficRateMbps <= 0.0 ||
        primaryCapacityMbps <= 0.0 || alternateCapacityMbps <= 0.0 ||
        (needsFailureTime && (failureAtSec <= 0.0 || failureAtSec >= simulationTime)) ||
        (scenarioName == "recovery" &&
         (restoreAtSec <= failureAtSec || restoreAtSec >= simulationTime)))
    {
        std::cerr << "Invalid scenario parameters; use a known scenario, positive rates, and valid event times.\n";
        return 2;
    }
    adaptiveMode = scenarioName == "adaptive";
    RngSeedManager::SetSeed(randomSeed);
    RngSeedManager::SetRun(randomRun);

    // ========================================================
    // HEADER
    // ========================================================

    std::cout << "\n";
    std::cout << "================================================\n";
    std::cout << "       SELF-HEALING ADAPTIVE NETWORK\n";
    std::cout << "          ROUTE VERIFICATION TEST\n";
    std::cout << "================================================\n";

    // ========================================================
    // NODES
    // ========================================================

    NodeContainer pc;
    NodeContainer r1;
    NodeContainer r2;
    NodeContainer r3;
    NodeContainer r4;
    NodeContainer server;

    pc.Create(1);
    r1.Create(1);
    r2.Create(1);
    r3.Create(1);
    r4.Create(1);
    server.Create(1);

    // ========================================================
    // LINK CONFIGURATION
    // ========================================================

    PointToPointHelper pcR1;

    pcR1.SetDeviceAttribute(
        "DataRate",
        StringValue("10Mbps"));

    pcR1.SetChannelAttribute(
        "Delay",
        StringValue("5ms"));

    // PRIMARY PATH
    PointToPointHelper r1R2;

    r1R2.SetDeviceAttribute(
        "DataRate",
        StringValue(std::to_string(primaryCapacityMbps) + "Mbps"));

    r1R2.SetChannelAttribute(
        "Delay",
        StringValue("10ms"));

    PointToPointHelper r2R4;

    r2R4.SetDeviceAttribute(
        "DataRate",
        StringValue(std::to_string(primaryCapacityMbps) + "Mbps"));

    r2R4.SetChannelAttribute(
        "Delay",
        StringValue("10ms"));

    // ALTERNATE PATH
    PointToPointHelper r1R3;

    r1R3.SetDeviceAttribute(
        "DataRate",
        StringValue(std::to_string(alternateCapacityMbps) + "Mbps"));

    r1R3.SetChannelAttribute(
        "Delay",
        StringValue("20ms"));

    PointToPointHelper r3R4;

    r3R4.SetDeviceAttribute(
        "DataRate",
        StringValue(std::to_string(alternateCapacityMbps) + "Mbps"));

    r3R4.SetChannelAttribute(
        "Delay",
        StringValue("20ms"));

    // SERVER LINK
    PointToPointHelper r4Server;

    r4Server.SetDeviceAttribute(
        "DataRate",
        StringValue("10Mbps"));

    r4Server.SetChannelAttribute(
        "Delay",
        StringValue("5ms"));

    // ========================================================
    // INSTALL DEVICES
    // ========================================================

    NetDeviceContainer pcR1Devices =
        pcR1.Install(
            pc.Get(0),
            r1.Get(0));

    NetDeviceContainer r1R2Devices =
        r1R2.Install(
            r1.Get(0),
            r2.Get(0));

    NetDeviceContainer r2R4Devices =
        r2R4.Install(
            r2.Get(0),
            r4.Get(0));

    NetDeviceContainer r1R3Devices =
        r1R3.Install(
            r1.Get(0),
            r3.Get(0));

    NetDeviceContainer r3R4Devices =
        r3R4.Install(
            r3.Get(0),
            r4.Get(0));

    NetDeviceContainer r4ServerDevices =
        r4Server.Install(
            r4.Get(0),
            server.Get(0));

    // ========================================================
    // INTERNET STACK
    // ========================================================

    InternetStackHelper internet;

    internet.Install(pc);
    internet.Install(r1);
    internet.Install(r2);
    internet.Install(r3);
    internet.Install(r4);
    internet.Install(server);

    // ========================================================
    // IP ADDRESSING
    // ========================================================

    Ipv4AddressHelper address;

    address.SetBase(
        "10.0.1.0",
        "255.255.255.0");

    Ipv4InterfaceContainer pcR1Interfaces =
        address.Assign(pcR1Devices);

    address.SetBase(
        "10.0.2.0",
        "255.255.255.0");

    Ipv4InterfaceContainer r1R2Interfaces =
        address.Assign(r1R2Devices);

    address.SetBase(
        "10.0.3.0",
        "255.255.255.0");

    Ipv4InterfaceContainer r2R4Interfaces =
        address.Assign(r2R4Devices);

    address.SetBase(
        "10.0.4.0",
        "255.255.255.0");

    Ipv4InterfaceContainer r1R3Interfaces =
        address.Assign(r1R3Devices);

    address.SetBase(
        "10.0.5.0",
        "255.255.255.0");

    Ipv4InterfaceContainer r3R4Interfaces =
        address.Assign(r3R4Devices);

    address.SetBase(
        "10.0.6.0",
        "255.255.255.0");

    Ipv4InterfaceContainer serverInterfaces =
        address.Assign(r4ServerDevices);

    serverAddress = serverInterfaces.GetAddress(1);

    // ========================================================
    // GLOBAL ROUTING
    // ========================================================

    Ipv4GlobalRoutingHelper::PopulateRoutingTables();

    r1Ipv4 = r1.Get(0)->GetObject<Ipv4>();
    Ipv4StaticRoutingHelper staticRoutingHelper;
    r1StaticRouting = staticRoutingHelper.GetStaticRouting(r1Ipv4);
    r1R2Interface = r1Ipv4->GetInterfaceForDevice(r1R2Devices.Get(0));
    r1R3Interface = r1Ipv4->GetInterfaceForDevice(r1R3Devices.Get(0));
    r1R2NextHop = r1R2Interfaces.GetAddress(1);
    r1R3NextHop = r1R3Interfaces.GetAddress(1);
    if (!r1StaticRouting || r1R2Interface >= r1Ipv4->GetNInterfaces() ||
        r1R3Interface >= r1Ipv4->GetNInterfaces())
    {
        std::cerr << "Could not initialize R1 static route interfaces.\n";
        Simulator::Destroy();
        return 2;
    }
    r1StaticRouting->AddHostRouteTo(serverAddress, r1R2NextHop, r1R2Interface);

    // ========================================================
    // GET POINT-TO-POINT DEVICES
    // ========================================================

    Ptr<PointToPointNetDevice> r1R2Device =
        DynamicCast<PointToPointNetDevice>(
            r1R2Devices.Get(0));

    Ptr<PointToPointNetDevice> r2R4Device =
        DynamicCast<PointToPointNetDevice>(
            r2R4Devices.Get(0));

    Ptr<PointToPointNetDevice> r1R3Device =
        DynamicCast<PointToPointNetDevice>(
            r1R3Devices.Get(0));

    Ptr<PointToPointNetDevice> r3R4Device =
        DynamicCast<PointToPointNetDevice>(
            r3R4Devices.Get(0));

    // ========================================================
    // GET ACTUAL QUEUE OBJECTS
    // ========================================================

    r1R2Queue =
        r1R2Device->GetQueue();

    r2R4Queue =
        r2R4Device->GetQueue();

    // ========================================================
    // QUEUE TRACE CONNECTIONS
    // ========================================================

    r1R2Queue->TraceConnectWithoutContext(
        "PacketsInQueue",
        MakeCallback(&R1R2QueueTrace));

    r2R4Queue->TraceConnectWithoutContext(
        "PacketsInQueue",
        MakeCallback(&R2R4QueueTrace));

    // ========================================================
    // LINK PACKET TRACE CONNECTIONS
    // ========================================================

    r1R2Device->TraceConnectWithoutContext(
        "MacTx",
        MakeCallback(&R1R2TxTrace));

    r2R4Device->TraceConnectWithoutContext(
        "MacTx",
        MakeCallback(&R2R4TxTrace));

    r1R3Device->TraceConnectWithoutContext(
        "MacTx",
        MakeCallback(&R1R3TxTrace));

    r3R4Device->TraceConnectWithoutContext(
        "MacTx",
        MakeCallback(&R3R4TxTrace));

    // ========================================================
    // UDP SERVER
    // ========================================================

    uint16_t port = 5000;

    PacketSinkHelper sinkHelper(
        "ns3::UdpSocketFactory",
        InetSocketAddress(
            Ipv4Address::GetAny(),
            port));

    ApplicationContainer sink =
        sinkHelper.Install(
            server.Get(0));

    sink.Start(
        Seconds(0.0));

    sink.Stop(
        Seconds(simulationTime));

    // ========================================================
    // UDP TRAFFIC
    // ========================================================

    OnOffHelper traffic(
        "ns3::UdpSocketFactory",
        InetSocketAddress(
            serverInterfaces.GetAddress(1),
            port));

    traffic.SetAttribute(
        "DataRate",
        StringValue(std::to_string(trafficRateMbps) + "Mbps"));

    traffic.SetAttribute(
        "PacketSize",
        UintegerValue(1024));

    traffic.SetAttribute(
        "OnTime",
        StringValue(
            "ns3::ConstantRandomVariable[Constant=1]"));

    traffic.SetAttribute(
        "OffTime",
        StringValue(
            "ns3::ConstantRandomVariable[Constant=0]"));

    ApplicationContainer source =
        traffic.Install(
            pc.Get(0));

    source.Start(
        Seconds(1.0));

    source.Stop(
        Seconds(simulationTime - 1));

    // ========================================================
    // FLOW MONITOR
    // ========================================================

    FlowMonitorHelper flowHelper;

    Ptr<FlowMonitor> monitor =
        flowHelper.InstallAll();

    if (scenarioName == "failure" || scenarioName == "recovery")
    {
        Simulator::Schedule(Seconds(failureAtSec), &FailPrimaryPath);
    }
    if (scenarioName == "recovery")
    {
        Simulator::Schedule(Seconds(restoreAtSec), &RestorePrimaryPath);
    }

    // ========================================================
    // DISPLAY INITIAL ROUTE
    // ========================================================

    std::cout << "\n";
    std::cout
        << "INITIAL ROUTE:\n";

    std::cout
        << "PC -> R1 -> R2 -> R4 -> Server\n";

    std::cout << "\n";

    std::cout
        << "Primary capacity: "
        << primaryCapacityMbps
        << " Mbps\n";

    std::cout
        << "Alternate capacity: "
        << alternateCapacityMbps
        << " Mbps\n";

    std::cout
        << "Traffic rate: "
        << trafficRateMbps
        << " Mbps\n";

    std::cout
        << "Congestion threshold: "
        << CONGESTION_THRESHOLD
        << " packets\n";

    std::cout << "\n";

    // ========================================================
    // SCHEDULE NETWORK MONITORS
    // ========================================================

    for (double t = 1.0;
         t < simulationTime;
         t += 0.5)
    {
        Simulator::Schedule(
            Seconds(t),
            &MonitorNetwork);
    }

    // ========================================================
    // RUN
    // ========================================================

    Simulator::Stop(
        Seconds(simulationTime));

    Simulator::Run();

    // ========================================================
    // FLOW MONITOR RESULTS
    // ========================================================

    monitor->CheckForLostPackets();

    uint64_t txPackets = 0;
    uint64_t rxPackets = 0;
    uint64_t lostPackets = 0;
    uint64_t rxBytes = 0;

    double delaySeconds = 0.0;

    for (auto const& flow :
         monitor->GetFlowStats())
    {
        txPackets +=
            flow.second.txPackets;

        rxPackets +=
            flow.second.rxPackets;

        rxBytes +=
            flow.second.rxBytes;

        lostPackets +=
            flow.second.lostPackets;

        delaySeconds +=
            flow.second.delaySum.GetSeconds();
    }

    double packetLossPct = 0.0;

    if (txPackets > 0)
    {
        packetLossPct =
            static_cast<double>(lostPackets) /
            txPackets *
            100.0;
    }

    double averageDelayMs = 0.0;

    if (rxPackets > 0)
    {
        averageDelayMs =
            delaySeconds /
            rxPackets *
            1000.0;
    }

    const double throughputMbps =
        static_cast<double>(rxBytes) * 8.0 / (simulationTime * 1000000.0);
    const double linkUtilizationPct = std::min(
        100.0,
        static_cast<double>(r1R2TxBytes) * 8.0 /
            (primaryCapacityMbps * simulationTime * 1000000.0) * 100.0);
    const bool alternateTrafficDetected =
        routeApplicationAttempted && r1R3PacketsAfterSwitch > 0 && r3R4PacketsAfterSwitch > 0;

    // ========================================================
    // FINAL RESULTS
    // ========================================================

    std::cout << "\n";
    std::cout << "================================================\n";
    std::cout << "             FINAL RESULTS\n";
    std::cout << "================================================\n";

    std::cout
        << "TX Packets: "
        << txPackets
        << "\n";

    std::cout
        << "RX Packets: "
        << rxPackets
        << "\n";

    std::cout
        << "Lost Packets: "
        << lostPackets
        << "\n";

    std::cout
        << "Packet Loss: "
        << packetLossPct
        << " %\n";

    std::cout
        << "Average Delay: "
        << averageDelayMs
        << " ms\n";

    std::cout << "\n";

    std::cout
        << "Maximum R1-R2 Queue: "
        << maxR1R2Queue
        << " packets\n";

    std::cout
        << "Maximum R2-R4 Queue: "
        << maxR2R4Queue
        << " packets\n";

    std::cout << "\n";

    std::cout
        << "R1 -> R2 packets: "
        << r1R2Packets
        << "\n";

    std::cout
        << "R2 -> R4 packets: "
        << r2R4Packets
        << "\n";

    std::cout
        << "R1 -> R3 packets: "
        << r1R3Packets
        << "\n";

    std::cout
        << "R3 -> R4 packets: "
        << r3R4Packets
        << "\n";

    std::cout << "\n";

    std::cout
        << "Route switch detected at: "
        << routeSwitchTime
        << " sec\n";

    if (r1R3Packets > 0)
    {
        std::cout << "\n";
        std::cout
            << "ALTERNATE PATH TRAFFIC: YES\n";

        std::cout
            << "Packets observed on R1-R3: "
            << r1R3Packets
            << "\n";
    }
    else
    {
        std::cout << "\n";
        std::cout
            << "ALTERNATE PATH TRAFFIC: NO\n";
    }

    // ========================================================
    // WRITE JSON
    // ========================================================

    std::ofstream output(
        outputPath);
    if (!output)
    {
        std::cerr << "Could not open result output path: " << outputPath << "\n";
        Simulator::Destroy();
        return 2;
    }

    output << std::fixed
           << std::setprecision(4);

    output << "{\n";

    output
        << "  \"scenario\": "
        << "\"" << scenarioName << "\",\n";

    output
        << "  \"simulationTimeSec\": "
        << simulationTime
        << ",\n";

    output
        << "  \"trafficRateMbps\": "
        << trafficRateMbps
        << ",\n";

    output
        << "  \"primaryCapacityMbps\": "
        << primaryCapacityMbps
        << ",\n";

    output
        << "  \"alternateCapacityMbps\": "
        << alternateCapacityMbps
        << ",\n";

    output
        << "  \"randomSeed\": "
        << randomSeed
        << ",\n"
        << "  \"randomRun\": "
        << randomRun
        << ",\n";

    output
        << "  \"primaryPathAvailable\": " << (primaryPathAvailable ? "true" : "false") << ",\n"
        << "  \"alternatePathAvailable\": true,\n";

    output
        << "  \"totalTxPackets\": "
        << txPackets
        << ",\n";

    output
        << "  \"totalRxPackets\": "
        << rxPackets
        << ",\n";

    output
        << "  \"totalLostPackets\": "
        << lostPackets
        << ",\n";

    output
        << "  \"packetLossPct\": "
        << packetLossPct
        << ",\n";

    output
        << "  \"averageDelayMs\": "
        << averageDelayMs
        << ",\n";

    output
        << "  \"throughputMbps\": "
        << throughputMbps
        << ",\n";

    output
        << "  \"linkUtilizationPct\": "
        << linkUtilizationPct
        << ",\n";

    output
        << "  \"r1R2MaxQueuePackets\": "
        << maxR1R2Queue
        << ",\n";

    output
        << "  \"r2R4MaxQueuePackets\": "
        << maxR2R4Queue
        << ",\n";

    output
        << "  \"r1R2Packets\": "
        << r1R2Packets
        << ",\n";

    output
        << "  \"r2R4Packets\": "
        << r2R4Packets
        << ",\n";

    output
        << "  \"r1R3Packets\": "
        << r1R3Packets
        << ",\n";

    output
        << "  \"r3R4Packets\": "
        << r3R4Packets
        << ",\n";

    output
        << "  \"routeApplicationAttempted\": "
        << (routeApplicationAttempted ? "true" : "false")
        << ",\n";

    output << "  \"routeSwitchTimeSec\": ";
    if (routeSwitchTime >= 0.0)
    {
        output << routeSwitchTime;
    }
    else
    {
        output << "null";
    }
    output << ",\n";

    output
        << "  \"alternateTrafficDetected\": "
        << (alternateTrafficDetected ? "true" : "false")
        << ",\n";

    output
        << "  \"selectedRoute\": "
        << (routeBActive ? "\"R1-R3-R4\"" : "\"R1-R2-R4\"")
        << ",\n";

    output
        << "  \"r1R3PacketsAfterSwitch\": "
        << r1R3PacketsAfterSwitch
        << ",\n";

    output
        << "  \"r3R4PacketsAfterSwitch\": "
        << r3R4PacketsAfterSwitch
        << ",\n"
        << "  \"routeSwitchEvents\": "
        << routeSwitchEvents
        << ",\n"
        << "  \"failureTimeSec\": ";
    if (failureTime >= 0.0)
    {
        output << failureTime;
    }
    else
    {
        output << "null";
    }
    output << ",\n"
           << "  \"recoveryTimeSec\": ";
    if (configuredRecoveryTime >= 0.0)
    {
        output << configuredRecoveryTime;
    }
    else
    {
        output << "null";
    }
    output << ",\n"
           << "  \"failureToAlternateTrafficMs\": ";
    if (failureTime >= 0.0 && firstAlternateTrafficTime >= failureTime)
    {
        output << (firstAlternateTrafficTime - failureTime) * 1000.0;
    }
    else
    {
        output << "null";
    }
    output << ",\n"
           << "  \"restoreToPrimaryTrafficMs\": ";
    if (configuredRecoveryTime >= 0.0 &&
        firstPrimaryTrafficAfterRecoveryTime >= configuredRecoveryTime)
    {
        output << (firstPrimaryTrafficAfterRecoveryTime - configuredRecoveryTime) * 1000.0;
    }
    else
    {
        output << "null";
    }
    output << ",\n"
           << "  \"firstPrimaryTrafficAfterRecoveryTimeSec\": ";
    if (firstPrimaryTrafficAfterRecoveryTime >= 0.0)
    {
        output << firstPrimaryTrafficAfterRecoveryTime;
    }
    else
    {
        output << "null";
    }
    output << ",\n";

    output << "  \"firstAlternateTrafficTimeSec\": ";
    if (firstAlternateTrafficTime >= 0.0)
    {
        output << firstAlternateTrafficTime;
    }
    else
    {
        output << "null";
    }
    output << "\n";

    output << "}\n";

    output.close();

    std::cout << "\n";
    std::cout
        << "Results written to:\n"
        << outputPath
        << "\n";

    std::cout << "================================================\n";

    Simulator::Destroy();

    return 0;
}
